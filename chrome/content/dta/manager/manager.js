/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* global _, DTA, $, $$, Utils, Preferences, getDefaultDownloadsDirectory, unloadWindow */
/* global $e, mapInSitu, filterMapInSitu, filterInSitu, mapFilterInSitu, setTimeoutOnlyFun */
/* global toURI, toURL, showPreferences, openUrl, getLargeIcon */
/* global Tree, Prefs */
/* global QUEUED, PAUSED, CANCELED, FINISHING, COMPLETE, RUNNING, SPEED_COUNT, REFRESH_FREQ, MIN_CHUNK_SIZE */
/* jshint strict:true, globalstrict:true, browser:true, latedef:false */

var {CoThreadListWalker} = require("support/cothreads");
var Prompts = require("prompts");
var {ByteBucket} = require("support/bytebucket");
var {GlobalBucket} = require("manager/globalbucket");
var {defer} = require("support/defer");
var PrivateBrowsing = require("support/pbm");
var {TimerManager} = require("support/timers");
var {ContentHandling} = require("support/contenthandling");
var GlobalProgress = new (require("manager/globalprogress").GlobalProgress)(window);
var RequestManipulation = require("support/requestmanipulation");
var Limits = require("support/serverlimits");
var {QueueStore} = require("manager/queuestore");
var {SpeedStats} = require("manager/speedstats");
var {FileExtensionSheet} = require("support/fileextsheet");
var {UrlManager} = require("support/urlmanager");
var {VisitorManager} = require("manager/visitormanager");
var Preallocator = require("manager/preallocator");
var {Chunk, hintChunkBufferSize} = require("manager/chunk");
var {Connection} = require("manager/connection");
var {createRenamer} = require("manager/renamer");
var {memoize, identity} = require("support/memoize");
var {moveFile} = require("support/movefile");
var {Task} = requireJSM("resource://gre/modules/Task.jsm");

// Use the main OS.File here!
var {OS} = requireJSM("resource://gre/modules/osfile.jsm");

/* global Version, AlertService, Decompressor, Verificator, FileExts:true */
XPCOMUtils.defineLazyGetter(window, "Version", () => require("version"));
XPCOMUtils.defineLazyGetter(window, "AlertService", () => require("support/alertservice"));
XPCOMUtils.defineLazyGetter(window, "Decompressor", () => require("manager/decompressor").Decompressor);
XPCOMUtils.defineLazyGetter(window, "Verificator", () => require("manager/verificator"));
XPCOMUtils.defineLazyGetter(window, "FileExts", () => new FileExtensionSheet(window, Tree));

/* global TextCache_PAUSED, TextCache_QUEUED, TextCache_COMPLETE, TextCache_CANCELED, TextCache_NAS */
/* global TextCache_UNKNOWN, TextCache_OFFLINE, TextCache_TIMEOUT, TextCache_STARTING, TextCache_DECOMPRESSING */
/* global TextCache_VERIFYING, TextCache_MOVING */
addEventListener("load", function load_textCache() {
	removeEventListener("load", load_textCache, false);
	const texts = ['paused', 'queued', 'complete', 'canceled', 'nas', 'unknown',
		'offline', 'timeout', 'starting', 'decompressing', 'verifying', 'moving'];
	for (let i = 0, text; i < texts.length; ++i) {
		text = texts[i];
		window["TextCache_" + text.toUpperCase()] = _(text);
	}
}, false);

function _moveFile(destination, self) {
	let remakeDir = false;
	let move = function(resolve, reject, x) {
		if (remakeDir) {
			Utils.makeDir(destination, Prefs.dirPermissions, true);
		}
		let df = destination.clone();
		df.append(self.destinationName);
		moveFile(self.tmpFile.path, df.path).then(function() {
			resolve(true);
		}, function(ex) {
			if ((ex.unixErrno && ex.unixErrno === OS.Constants.libc.ENAMETOOLONG) ||
					(ex.winLastError && ex.winLastError === 3)) {
				try {
					self.shortenName();
					ConflictManager.unpin(pinned);
					pinned = self.destinationFile;
					ConflictManager.pin(pinned);
				}
				catch (iex) {
					log(LOG_ERROR, "Failed to shorten name", ex);
				}
			}
			if (ex.becauseNoSuchFile || (ex.unixErrno && ex.unixErrno === OS.Constants.libc.ENOENT)) {
				remakeDir = true;
			}
			log(LOG_ERROR, ex);
			x = x || 1;
			if (x > 5) {
				log(LOG_ERROR, "shit hit the fan!");
				reject(ex);
				return;
			}
			setTimeoutOnlyFun(() => move(resolve, reject, ++x), x * 250);
		}).catch(reject);
	};
	return new Promise(move);
};

function dieEarly() {
	window.removeEventListener("unload", dieEarly, false);
	let evt = document.createEvent("Event");
	evt.initEvent("DTA:diedEarly", true, false);
	window.dispatchEvent(evt);
}
window.addEventListener("unload", dieEarly, false);

var Timers = new TimerManager();

var Dialog_loadDownloads_props =
	['contentType', 'conflicts', 'postData', 'destinationName', 'resumable', 'compression',
		'fromMetalink', 'speedLimit', "cleanRequest"];
function Dialog_loadDownloads_get(down, attr, def) {
	return (attr in down) ? down[attr] : (def ? def : '');
};

var Dialog_serialize_props =
	['fileName', 'fileNameFromUser', 'postData', 'description', 'title', 'resumable', 'mask', 'pathName',
		'compression', 'contentType', 'conflicts', 'fromMetalink', 'speedLimit', "relaxSize", "cleanRequest"];

var Dialog = {
	_observes: [
		'quit-application-requested',
		'quit-application-granted',
		'network:offline-status-changed',
		'DTA:filterschanged',
		'DTA:clearedQueueStore',
		'DTA:shutdownQueueStore',
		"DTA:upgrade",
	],
	_initialized: false,
	_autoRetrying: [],
	_offline: false,
	_maxObservedSpeed: 0,

	get offline() {
		return this._offline || this._offlineForced;
	},
	set offline(nv) {
		this._offline = !!nv;
		$('cmdToggleOffline').setAttribute('disabled', this._offline);
		this._processOfflineChange();
		return this._offline;
	},
	get offlineForced() {
		return this._offlineForced;
	},
	set offlineForced(nv) {
		this._offlineForced = !!nv;
		let netstatus = $('netstatus');
		if (this._offlineForced) {
			netstatus.setAttribute('offline', true);
		}
		else if (netstatus.hasAttribute('offline')) {
			netstatus.removeAttribute('offline');
		}
		this._processOfflineChange();
		return this._offlineForced;
	},

	_wasRunning: false,
	_sum: 0,
	_speeds: new SpeedStats(10),
	_running: [],
	_autoClears: [],
	completed: 0,
	finishing: 0,
	totalBytes: 0,
	init: function() {
		Prefs.init();

		this.statusText = $("statusText");
		this.statusSpeed = $("statusSpeed");

		// Set tooltip texts for each tb button lacking one (copy label)
		(function addTooltips() {
			for (let e of document.getElementsByTagName('toolbarbutton')) {
				if (!e.hasAttribute('tooltiptext')) {
					e.setAttribute('tooltiptext', e.getAttribute('label'));
				}
			}
			$('tbp_' + $('tools').getAttribute('mode')).setAttribute('checked', "true");
		})();


		(function initActions() {
			let tb = $('actions');
			for (let e of $$('#popup menuitem')) {
				e.className += " " + e.id;
			}
			for (let e of $$('#popup .action')) {
				if (e.localName === 'menuseparator') {
					tb.appendChild($e('toolbarseparator'));
					continue;
				}
				tb.appendChild($e('toolbarbutton', {
					id: 'act' + e.id,
					'class': e.id,
					command: e.getAttribute('command'),
					tooltiptext: e.getAttribute('tooltiptext') || e.label
				}));
			}
		})();

		(function initListeners() {
			addEventListener("unload", () => Dialog.unload(), false);
			addEventListener("close", evt => Dialog.onclose(evt), false);

			addEventListener("dragover", function(event) {
				try {
					if (event.dataTransfer.types.contains("text/x-moz-url")) {
						event.dataTransfer.dropEffect = "link";
						event.preventDefault();
					}
				}
				catch (ex) {
					log(LOG_ERROR, "failed to process ondragover", ex);
				}
			}, true);
			addEventListener("drop", function(event) {
				try {
					let url = event.dataTransfer.getData("URL");
					if (!url) {
						return;
					}
					let isPrivate = event.dataTransfer.mozSourceNode &&
						PrivateBrowsing.isWindowPrivate(event.dataTransfer.mozSourceNode.ownerDocument.defaultView);
					url = Services.io.newURI(url, null, null);
					let item = {
						"url": new DTA.URL(DTA.getLinkPrintMetalink(url) || url),
						"referrer": null,
						'description': "",
						"isPrivate": isPrivate
					};
					DTA.saveSingleItem(window, false, item);
				}
				catch (ex) {
					log(LOG_ERROR, "failed to process ondrop", ex);
				}
			}, true);

			$('tooldonate').addEventListener('click', function(evt) {
				if (evt.button === 0) {
					Dialog.openDonate();
				}
			}, false);
		})();

		this.paneSchedule = $("schedule");
		this.paneSchedule.addEventListener("command", function() {
			showPreferences("paneSchedule");
		}, false);

		let tree = $("downloads");
		Tree.init(tree);
		addEventListener("unload", function unloadUnlink() {
			removeEventListener("unload", unloadUnlink, false);
			Tree.unlink();
		}, false);
		tree.addEventListener("change", () => {
			log(LOG_DEBUG, "tree change");
			Dialog.resetScheduler();
		}, true);
		try {
			defer(this._loadDownloads, this);
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to load any downloads from queuefile", ex);
		}

		try {
			this.offline = Services.io.offline;
		}
		catch (ex) {
			log(LOG_ERROR, "Cannot get offline status", ex);
		}

		Preferences.makeObserver(this);
		const obs = require("support/observers");
		for (let topic of this._observes) {
			obs.add(this, topic);
		}
		const unload_obs = (function() {
			removeEventListener("unload", unload_obs, false);
			for (let topic of this._observes) {
				obs.remove(this, topic);
			}
		}).bind(this);
		addEventListener("unload", unload_obs, false);

		// Autofit
		(function autofit() {
			let de = document.documentElement;
			Version.getInfo(function(version) {
				let cv = version.VERSION + ".toolitems" + $('tools').childNodes.length;
				let shouldAutofit = !de.hasAttribute('dtaAutofitted');
				if (!shouldAutofit) {
					try {
						let lv = de.getAttribute('dtaAutofitted');
						shouldAutofit = !!version.compareVersion(cv, lv);
					}
					catch (ex) {
						shouldAutofit = true;
					}
				}
				if (shouldAutofit) {
					document.documentElement.setAttribute('dtaAutofitted', cv);
					$('tools').setAttribute('mode', 'icons');
					defer(
						function() {
							let tdb = $('tooldonate').boxObject;
							let db = de.boxObject;
							let cw = tdb.width + tdb.x;
							if (db.width < cw) {
								window.resizeTo(cw, window.outerHeight);
								log(LOG_DEBUG, "manager was autofit");
							}
						}
					);
				}
			});
		})();

		$('listSpeeds').limit = Prefs.speedLimit;
		$('listSpeedsSpinners').addEventListener('up', () => Dialog.changeSpeedLimitUp(), false);
		$('listSpeedsSpinners').addEventListener('down', () => Dialog.changeSpeedLimitDown(), false);

		(function nagging() {
			if (Preferences.getExt('nagnever', false)) {
				return;
			}
			let nb = $('notifications');
			try {
				let seq = QueueStore.getQueueSeq();
				let nagnext = Preferences.getExt('nagnext', 100);
				log(LOG_DEBUG, "nag: " + seq + "/" + nagnext + "/" + (seq - nagnext));
				if (seq < nagnext) {
					return;
				}
				for (nagnext = isFinite(nagnext) && nagnext > 0 ? nagnext : 100; seq >= nagnext;) {
					nagnext *= 2;
				}

				seq = Math.floor(seq / 100) * 100;

				setTimeoutOnlyFun(function() {
					let ndonation = nb.appendNotification(
							_('nagtext', [seq]),
							"donation",
							null,
							nb.PRIORITY_INFO_HIGH,
							[
								{
									accessKey: '',
									label: _('nagdonate'),
									callback: function() {
										nb.removeNotification(ndonation);
										Preferences.setExt('nagnext', nagnext);
										Preferences.setExt('nagnever', true);
										Dialog.openDonate();
									}
								},
								{
									accessKey: '',
									label: _('naghide'),
									callback: function() {
										Preferences.setExt('nagnext', nagnext);
										nb.removeNotification(ndonation);
									}
								},
								{
									accessKey: '',
									label: _('dontaskagain'),
									callback: function() {
										nb.removeNotification(ndonation);
										Preferences.setExt('nagnever', true);
									}
								}

							]
					);
				}, 1000);
			}
			catch (ex) {
				log(LOG_ERROR, 'nagger', ex);
			}
		})();

		(function checkLogging() {
			if (!log.enabled) {
				return;
			}
			let nb = $('notifications');
			nb.appendNotification(_("logging.enabled.warn"), 0, null, nb.PRIORITY_WARNING_MEDIUM, [
				{
					accessKey: "",
					label: _("keep"),
					callback: function() {}
				},
				{
					accessKey: "",
					label: _("disable"),
					callback: function() {
						Preferences.resetExt("logging");
					}
				},
				{
					accessKey: "",
					label: _("manualfix3"),
					callback: function() {
						showPreferences("panePrivacy");
					}
				}
			]);
		})();
	},

	customizeToolbar: function(evt) {
		$('tools').setAttribute('mode', evt.target.getAttribute('mode'));
	},

	changeSpeedLimit: function() {
		let list = $('listSpeeds');
		let val = list.limit;
		Preferences.setExt('speedlimit', val);
		this._speeds.clear();
	},
	changeSpeedLimitUp: function() {
		$('listSpeeds').limit = Math.max(0, $('listSpeeds').limit) + 25600;
		this.changeSpeedLimit();
	},
	changeSpeedLimitDown: function() {
		$('listSpeeds').limit -= 25600;
		this.changeSpeedLimit();
	},
	_loadDownloads: function() {
		this._loading = $('loading');
		if (!this._loading) {
			this._loading = {};
		}
		Tree.beginUpdate();
		Tree.clear();
		this._brokenDownloads = [];
		log(LOG_INFO, "loading of the queue started!");
		GlobalProgress.reset();
		GlobalProgress.pause();
		QueueStore.loadItems(function(result) {
			if (!result || !result.length) {
				log(LOG_DEBUG, "The cake is a lie");
				this._loadDownloads_finish();
				return;
			}
			log(LOG_INFO, "Result has arrived: " + result.length);
			this._loader = new CoThreadListWalker(
				this._loadDownloads_item,
				result,
				-1,
				this
			);
			let self = this;
			this._loader.start(function() {
				result = null;
				self._loadDownloads_finish();
			});
		}, this);
	},
	_loadDownloads_item: function(dbItem, idx) {
		if (!idx) {
			GlobalProgress.total = dbItem.count;
		}
		if (!(idx % 250)) {
			GlobalProgress.value = idx;
		}
		if (!(idx % 500)) {
			this._loading.label = _('loading2', [idx, dbItem.count, Math.floor(idx * 100 / dbItem.count)]);
		}

		try {
			let down = dbItem.item;
			let d = new QueueItem();
			d.dbId = dbItem.id;
			let state = Dialog_loadDownloads_get(down, "state");
			if (state) {
				d._setStateInternal(state);
			}
			d.urlManager = new UrlManager(down.urlManager);
			d.bNum = Dialog_loadDownloads_get(down, "numIstance");
			d.iNum = Dialog_loadDownloads_get(down, "iNum");

			let referrer = Dialog_loadDownloads_get(down, "referrer");
			if (referrer) {
				try {
					d.referrer = toURL(referrer);
				}
				catch (ex) {
					// We might have been fed with about:blank or other crap. so ignore.
				}
			}

			// only access the setter of the last so that we don't generate stuff trice.
			d._pathName = identity(Dialog_loadDownloads_get(down, "pathName"));
			d._description = identity(Dialog_loadDownloads_get(down, "description"));
			d._title = identity(Dialog_loadDownloads_get(down, "title"));
			d._mask = identity(Dialog_loadDownloads_get(down, "mask"));
			d._fileName = Dialog_loadDownloads_get(down, "fileName");
			if (down.fileNameFromUser) {
				d.fileNameFromUser = true;
			}

			let tmpFile = Dialog_loadDownloads_get(down, "tmpFile");
			if (tmpFile) {
				try {
					tmpFile = new Instances.LocalFile(tmpFile);
					if (tmpFile.exists()) {
						d._tmpFile = tmpFile;
					}
					else {
						// Download partfile is gone!
						// XXX find appropriate error message!
						d.fail(_("accesserror"), _("accesserror.long"), _("accesserror"));
					}
				}
				catch (ex) {
					log(LOG_ERROR, "tried to construct with invalid tmpFile", ex);
					d.cancel();
				}
			}

			d.startDate = new Date(Dialog_loadDownloads_get(down, "startDate"));
			d.visitors.load(down.visitors);

			for (let i = 0, e; i < Dialog_loadDownloads_props.length; ++i) {
				e = Dialog_loadDownloads_props[i];
				if (e in down) {
					d[e] = down[e];
				}
			}

			// don't trigger prealloc!
			d._totalSize = down.totalSize ? down.totalSize : 0;
			d.relaxSize = !!down.relaxSize;

			if (down.hashCollection) {
				d.hashCollection = DTA.HashCollection.load(down.hashCollection);
			}
			else if (down.hash) {
				d.hashCollection = new DTA.HashCollection(new DTA.Hash(down.hash, down.hashType));
			}
			if ('maxChunks' in down) {
				d._maxChunks = down.maxChunks;
			}

			d.started = !!d.partialSize;
			switch (d.state) {
				case PAUSED:
				case QUEUED:
				{
					for (let i = 0, c; i < down.chunks.length; ++i) {
						c = down.chunks[i];
						d.chunks.push(new Chunk(d, c.start, c.end, c.written));
					}
					d.refreshPartialSize();
					if (d.state === PAUSED) {
						d.status = TextCache_PAUSED;
					}
					else {
						d.status = TextCache_QUEUED;
					}
				}
				break;

				case COMPLETE:
					d.partialSize = d.totalSize;
					d.status = TextCache_COMPLETE;
				break;

				case CANCELED:
					d.status = TextCache_CANCELED;
				break;
			}

			// XXX better call this only once
			// See above
			d.rebuildDestination();
			Tree.fastLoad(d);
			d.position = dbItem.pos;
		}
		catch (ex) {
			log(LOG_ERROR, 'failed to init download #' + dbItem.id + ' from queuefile', ex);
			this._brokenDownloads.push(dbItem.id);
		}
		return true;
	},
	_loadDownloads_finish: function() {
		log(LOG_INFO, "Result was processed");
		delete this._loader;
		Tree.savePositions();
		Tree.invalidate();
		Tree.doFilter();
		Tree.endUpdate();

		if (this._brokenDownloads.length) {
			QueueStore.beginUpdate();
			try {
				for (let id of this._brokenDownloads) {
					QueueStore.deleteDownload(id);
					log(LOG_ERROR, "Removed broken download #" + id);
				}
			}
			catch (ex) {
				log(LOG_ERROR, "failed to remove broken downloads", ex);
			}
			QueueStore.endUpdate();
		}
		delete this._brokenDownloads;
		delete this._loading;

		GlobalProgress.reset();
		this.statusText.hidden = false;

		this._updTimer = Timers.createRepeating(REFRESH_FREQ, this.process, this, true);
		this.refresh();
		this.start();
	},

	openAdd: function() {
		window.openDialog(
			'chrome://dta/content/dta/addurl.xul',
			'_blank',
			Version.OS === 'darwin' ? 'chrome,modal,dependent=yes' : 'chrome,centerscreen,dialog=no,dependent=yes'
		);
	},

	openDonate: function() {
		try {
			openUrl('http://www.downthemall.net/howto/donate/');
		}
		catch(ex) {
			window.alert(ex);
		}
	},
	openInfo: function(downloads) {
		let w = window.openDialog(
			"chrome://dta/content/dta/manager/info.xul","_blank",
			"chrome, centerscreen, dialog=no",
			downloads,
			this
			);
	},

	start: function() {
		if (this._initialized) {
			return;
		}

		this._initialized = true;
		for (let d of Tree.all) {
			if (d.state === FINISHING) {
				this.run(d);
			}
		}
		Timers.createRepeating(200, this.refreshWritten, this, true);
		Timers.createRepeating(10000, this.saveRunning, this);

		$('loadingbox').parentNode.removeChild($('loadingbox'));
		window.removeEventListener("unload", dieEarly, false);
		let evt = document.createEvent("Event");
		evt.initEvent("DTA:ready", true, false);
		window.dispatchEvent(evt);
	},

	reinit: function(mustClear) {
		if (!this._initialized) {
			log(LOG_DEBUG, "reinit canceled");
		}
		let method = mustClear ? 'cancel' : 'pause';
		Tree.updateAll(function(download) {
			if (download.state !== COMPLETE) {
				download[method]();
			}
			return true;
		});
		try {
			log(LOG_INFO, "reinit initiated");
			defer(() => this.shutdown(this._continueReinit), this);
		}
		catch (ex) {
			log(LOG_DEBUG, "reinit: Failed to reload any downloads from queuefile", ex);
		}
	},
	_continueReinit: function() {
		this._running = [];
		delete this._forceQuit;
		this._speeds.clear();
		this.offlineForced = false;

		this._loadDownloads();
	},

	observe: function(subject, topic, data) {
		if (topic === 'quit-application-requested') {
			if (!this._canClose()) {
				delete this._forceClose;
				try {
					let cancelQuit = subject.QueryInterface(Ci.nsISupportsPRBool);
					cancelQuit.data = true;
				}
				catch (ex) {
					log(LOG_ERROR, "cannot set cancelQuit", ex);
				}
			}
		}
		else if (topic === "DTA:upgrade") {
			Preferences.setExt("rebootOnce", true);
			if (!this._canClose()) {
				delete this._forceClose;
				try {
					let cancelQuit = subject.QueryInterface(Ci.nsISupportsPRBool);
					cancelQuit.data = true;
					this._mustReload = true;
					for (let d of Tree.all) {
						if (d.state === RUNNING && d.canResumeLater) {
							d.pause();
							d.queue();
						}
					}
				}
				catch (ex) {
					log(LOG_ERROR, "cannot set cancelQuit on upgrade", ex);
				}
			}
		}
		else if (topic === 'quit-application-granted') {
			this._forceClose = true;
			delete this._mustReload;
		}
		else if (topic === 'network:offline-status-changed') {
			this.offline = data === "offline";
		}
		else if (topic === 'DTA:filterschanged') {
			Tree.assembleMenus();
		}
		else if (topic === 'DTA:clearedQueueStore') {
			this.reinit(true);
		}
		else if (topic === 'DTA:shutdownQueueStore') {
			log(LOG_INFO, "saving running");
			this.saveRunning();
		}
	},
	refresh: function() {
		try {
			const now = Utils.getTimestamp();
			for (let i = 0, e = this._running.length; i < e; ++i) {
				let d = this._running[i];
				if (!d) {
					continue;
				}
				d.refreshPartialSize();
				let advanced = d.speeds.add(d.partialSize + d.otherBytes, now);
				this._sum += advanced;

				// Calculate estimated time
				if (advanced !== 0 && d.totalSize > 0) {
					let remaining = Math.ceil((d.totalSize - d.partialSize) / d.speeds.avg);
					if (!isFinite(remaining)) {
						d.status = TextCache_UNKNOWN;
						d.estimated = 0;
					}
					else {
						d.status = Utils.formatTimeDelta(remaining);
						d.estimated = remaining;
					}
				}
				d.speed = Utils.formatSpeed(d.speeds.avg);
				if (d.speedLimit > 0) {
					d.speed += " (" + Utils.formatSpeed(d.speedLimit, 0) + ")";
				}
			}
			this._speeds.add(this._sum, now);
			let speed = Utils.formatSpeed(this._speeds.avg);
			this._maxObservedSpeed = Math.max(this._speeds.avg || this._maxObservedSpeed, this._maxObservedSpeed);
			for (let e of $('listSpeeds', 'perDownloadSpeedLimitList')) {
				try {
					e.hint = this._maxObservedSpeed;
					hintChunkBufferSize(this._maxObservedSpeed);
				}
				catch (ex) {
					log(LOG_ERROR, "set hint threw; mos is " + this._maxObservedSpeed, ex);
				}
			}

			// Refresh status bar
			this.statusText.label = _("currentdownloadstats",
				[this.completed, Tree.downloadCount, Tree.rowCount, this._running.length]);
			if (!this._running.length) {
				this.statusSpeed.hidden = true;
			}
			else {
				this.statusSpeed.hidden = false;
				this.statusSpeed.label = speed;
			}

			// Refresh window title
			if (this._running.length === 1 && this._running[0].totalSize > 0) {
				if (Tree.filtered) {
					document.title = _('titlespeedfiltered', [
						this._running[0].percent,
						this.statusSpeed.label,
						this.completed,
						Tree.downloadCount,
						Tree.rowCount
					]);
				}
				else {
					document.title = _('titlespeed', [
						this._running[0].percent,
						this.statusSpeed.label,
						this.completed,
						Tree.downloadCount,
					]);
				}
				if (this._running[0].totalSize) {
					GlobalProgress.activate(this._running[0].progress * 10, 1000);
				}
				else {
					GlobalProgress.unknown();
				}
			}
			else if (this._running.length > 0) {
				let p = Math.floor(this.completed * 1000 / Tree.downloadCount);
				let pt = Math.floor(this.completed * 100 / Tree.downloadCount) + '%';
				if (Tree.filtered) {
					document.title = _('titlespeedfiltered', [
						pt,
						this.statusSpeed.label,
						this.completed,
						Tree.downloadCount,
						Tree.rowCount
					]);
				}
				else {
					document.title = _('titlespeed', [
						pt,
						this.statusSpeed.label,
						this.completed,
						Tree.downloadCount
					]);
				}
				GlobalProgress.activate(p, 1000);
			}
			else {
				if (Tree.downloadCount) {
					let state = COMPLETE;
					for (let d of Tree.all) {
						const dstate = d.state;
						if (dstate === CANCELED) {
							state = CANCELED;
							break;
						}
						if (dstate === PAUSED) {
							state = PAUSED;
							break;
						}
					}
					let p = Math.floor(this.completed * 1000 / Tree.downloadCount);
					switch (state) {
					case CANCELED:
						GlobalProgress.error(p, 1000);
						break;
					case PAUSED:
						GlobalProgress.pause(p, 1000);
						break;
					default:
						GlobalProgress.hide();
					}
				}
				else {
					GlobalProgress.hide();
				}
				if (Tree.filtered) {
					document.title = _('titleidlefiltered', [
						this.completed,
						Tree.downloadCount,
						Tree.rowCount
					]);
				}
				else {
					document.title = _('titleidle', [
						this.completed,
						Tree.downloadCount
					]);
				}
			}
			($('titlebar') || {}).value = document.title;
		}
		catch(ex) {
			log(LOG_ERROR, "refresh():", ex);
		}
	},
	refreshWritten: function() {
		for (let i = 0, e = this._running.length; i < e; ++i) {
			let d = this._running[i];
			if (!d) {
				continue;
			}
			d.refreshPartialSize();
			d.invalidate();
		}
	},
	saveRunning: function() {
		if (!this._running.length) {
			return;
		}
		for (let i = 0, e = this._running.length; i < e; ++i) {
			this._running[i].save();
		}
	},

	_processOfflineChange: function() {
		let de = $('downloads');
		if (this.offline === de.hasAttribute('offline')) {
			return;
		}

		if (this.offline) {
			de.setAttribute('offline', true);
			$('netstatus').setAttribute('offline', true);
			for (let d of Tree.all) {
				if (d.state === RUNNING) {
					d.pause();
					d.queue();
				}
			}
		}
		else if (de.hasAttribute('offline')) {
			de.removeAttribute('offline');
			$('netstatus').removeAttribute('offline');
		}
		Tree.box.invalidate();
	},

	process: function() {
		Prefs.refreshConnPrefs(this._running);

		try {
			this.refresh();

			let ts = Utils.getTimestamp();
			for (let i = 0, e = this._running.length; i < e; ++i) {
				let d = this._running[i];
				if (!d || d.isCritical) {
					continue;
				}
				// checks for timeout
				if (d.state === RUNNING && (ts - d.timeLastProgress) >= Prefs.timeout * 1000) {
					if (d.resumable || !d.totalSize || !d.partialSize || Prefs.resumeOnError) {
						d.pauseAndRetry();
						d.status = TextCache_TIMEOUT;
					}
					else {
						d.cancel(TextCache_TIMEOUT);
					}
					log(LOG_ERROR, d + " is a timeout");
				}
			}

			this.processAutoClears();

			if (!this.offline && !this._mustReload) {
				if (Prefs.autoRetryInterval) {
					filterInSitu(this._autoRetrying, d => !d.autoRetry());
				}
				this.startNext();
			}
		}
		catch(ex) {
			log(LOG_ERROR, "process():", ex);
		}
	},
	processAutoClears: (function() {
		function _m(e) {
			return e && e.get();
		}
		function _f(e) {
			return !!e;
		}
		return function() {
			if (Prefs.autoClearComplete && this._autoClears.length) {
				Tree.remove(this._autoClears);
				this._autoClears.length = 0;
			}
		};
	})(),
	scheduler: null,
	startNext: function() {
		try {
			var rv = false;
			// pre-condition, do check prior to loop, or else we'll have the generator cost.
			if (this._running.length >= Prefs.maxInProgress) {
				return false;
			}
			if (Prefs.schedEnabled) {
				this.paneSchedule.removeAttribute("disabled");

				let current = new Date();
				current = current.getHours() * 60 + current.getMinutes();
				let disabled;
				if (Prefs.schedStart < Prefs.schedEnd) {
					disabled = current < Prefs.schedStart || current > Prefs.schedEnd;
				}
				else {
					disabled = current < Prefs.schedStart && current > Prefs.schedEnd;
				}

				if (disabled) {
					this.paneSchedule.removeAttribute("running");
					this.paneSchedule.setAttribute("tooltiptext", _("schedule.paused"));
					return false;
				}

				this.paneSchedule.setAttribute("running", "true");
				this.paneSchedule.setAttribute("tooltiptext", _("schedule.running"));
			}
			else {
				this.paneSchedule.setAttribute("disabled", "true");
			}
			if (!this.scheduler) {
				this.scheduler = Limits.getConnectionScheduler(Tree.all);
				log(LOG_DEBUG, "rebuild scheduler");
			}
			let finishingPenality = Math.ceil(this.finishing / 10);
			while (this._running.length < Prefs.maxInProgress - finishingPenality) {
				let d = this.scheduler.next(this._running);
				if (!d) {
					break;
				}
				if (d.state !== QUEUED) {
					log(LOG_ERROR, "FIXME: scheduler returned unqueued download");
					continue;
				}
				if (!this.run(d)) {
					break;
				}
				rv = true;
			}
			return rv;
		}
		catch(ex){
			log(LOG_ERROR, "startNext():", ex);
		}
		return false;
	},
	run: function(download, forced) {
		if (this.offline) {
			return false;
		}
		download.forced = !!forced;
		download.status = TextCache_STARTING;
		if (download.partialSize) {
			// only ever consider downloads complete where there was actual data retrieved
			if (!download.totalSize || download.partialSize > download.totalSize) {
				// only ever consider downloads to be complete which a saane ammount of data retrieved
				// or where the totalSize is not known
				if (download.state === FINISHING || download.totalSize) {
					// So by now we got a download that
					// 1. always as data
					// 2. is set to FINISHING already
					// 3. or has partialSize > totalSize (and a totalSize) indicating it is complete
					download.setState(FINISHING);
					if (download.totalSize) {
						download.partialSize = download.totalSize;
					}
					log(LOG_INFO, "Download seems to be complete; likely a left-over from a crash, finish it:" + download);
					download.finishDownload();
					return true;
				}
			}
		}
		download.timeLastProgress = Utils.getTimestamp();
		download.timeStart = Utils.getTimestamp();
		download.setState(RUNNING);
		if (!download.started) {
			download.started = true;
			log(LOG_INFO, "Let's start " + download);
		}
		else {
			log(LOG_INFO, "Let's resume " + download + " at " + download.partialSize);
		}
		this._running.push(download);
		download.prealloc();
		download.resumeDownload();
		return true;
	},
	wasStopped: function(download) {
		let idx = this._running.indexOf(download);
		if (idx > -1) {
			this._running.splice(idx, 1);
		}
	},
	wasFinished: function() {
		--this.finishing;
	},
	resetScheduler: function() {
		if (!Dialog.scheduler) {
			return;
		}
		Dialog.scheduler.destroy();
		Dialog.scheduler = null;
	},
	_signal_some: function(d) {
		return d.isOf(FINISHING | RUNNING | QUEUED);
	},
	signal: function(download) {
		download.save();
		const state = download.state;
		if (state === QUEUED) {
			Dialog.resetScheduler();
			return;
		}
		if (state === RUNNING) {
			this._wasRunning = true;
		}
		else if (Prefs.autoClearComplete && state === COMPLETE) {
			this._autoClears.push(download);
		}
		if (!this._initialized || !this._wasRunning || state !== COMPLETE) {
			return;
		}
		try {
			// check if there is something running or scheduled
			if (this._mustReload) {
				Dialog.close();
				return;
			}
			if (this.startNext() || Tree.some(this._signal_some)) {
				return;
			}
			this._speeds.clear();
			log(LOG_DEBUG, "signal(): Queue finished");
			if (Prefs.soundsDone) {
				$("sound_done").play();
			}

			let dp = Tree.at(0);
			if (dp) {
				dp = dp.destinationPath;
			}
			if (Prefs.alertingSystem === 1) {
				AlertService.show(_("suc.title"), _('suc'), () => Utils.launch(dp));
			}
			else if (dp && Prefs.alertingSystem === 0) {
				if (!Prompts.confirmYN(window, _('suc'),  _("openfolder"))) {
					try {
						Utils.launch(dp);
					}
					catch (ex){
						// no-op
					}
				}
			}
			if (Prefs.autoClose) {
				setTimeoutOnlyFunc(() => Dialog.close(), 1500);
			}
		}
		catch(ex) {
			log(LOG_ERROR, "signal():", ex);
		}
	},
	markAutoRetry: function(download) {
		if (!~this._autoRetrying.indexOf(download)) {
			this._autoRetrying.push(download);
		}
	},
	wasRemoved: function(download) {
		let idx = this._running.indexOf(download);
		if (idx > -1) {
			this._running.splice(idx, 1);
		}
		idx = this._autoRetrying.indexOf(download);
		if (idx > -1) {
			this._autoRetrying.splice(idx, 1);
		}
	},
	onclose: function(evt) {
		let rv = Dialog.close();
		if (!rv) {
			evt.preventDefault();
		}
		return rv;
	},
	_canClose: function() {
		if (Tree.some(function(d) { return d.started && !d.canResumeLater && d.state === RUNNING; })) {
			let rv = Prompts.confirmYN(
				window,
				_("confclose.2"),
				_("nonresclose")
			);
			if (rv) {
				return false;
			}
		}
		if (Tree.some(d => d.isPrivate && d.state !== COMPLETE)) {
			let rv = Prompts.confirmYN(
				window,
				_("confclose.2"),
				_("privateclose")
			);
			if (rv) {
				return false;
			}
		}

		return (this._forceClose = true);
	},
	close: function() {
		return this.shutdown(this._doneClosing);
	},
	_doneClosing: function() {
		close();
	},
	shutdown: function(callback) {
		log(LOG_INFO, "Close request");
		if (!this._initialized) {
			log(LOG_INFO, "not initialized. Going down immediately!");
			callback.call(this);
			return true;
		}
		if (!this._forceClose && !this._canClose()) {
			delete this._forceClose;
			log(LOG_INFO, "Not going to close!");
			return false;
		}
		this.offlineForced = true;

		// stop everything!
		// enumerate everything we'll have to wait for!
		if (this._updTimer) {
			Timers.killTimer(this._updTimer);
			delete this._updTimer;
		}

		let chunks = 0;
		let finishing = 0;
		log(LOG_INFO, "Going to close all");
		Tree.updateAll(
			function(d) {
				if (!d.is(COMPLETE) && d.isPrivate) {
					d.cancel();
				}
				else if (d.is(RUNNING)) {
					// enumerate all running chunks
					for (let c of d.chunks) {
						if (c.running) {
							++chunks;
						}
					}
					d.pause();
					d.setState(QUEUED);
				}
				else if (d.state === FINISHING) {
					++finishing;
				}
				d.shutdown();
				return true;
			},
			this
		);
		log(LOG_INFO, "Still running: " + chunks + " Finishing: " + finishing);
		if (chunks || finishing) {
			if (!this._forceClose && this._safeCloseAttempts < 20) {
				++this._safeCloseAttempts;
				Timers.createOneshot(250, () => this.shutdown(callback), this);
				return false;
			}
			log(LOG_ERROR, "Going down even if queue was not probably closed yet!");
		}
		callback.call(this);
		this._initialized = false;
		return true;
	},
	_cleanTmpDir: function() {
		if (!Prefs.tempLocation || Preferences.getExt("tempLocation", "")) {
			// cannot perform this action if we don't use a temp file
			// there might be far too many directories containing far too many
			// tmpFiles.
			// or part files from other users.
			return;
		}
		let known = [];
		for (let d of Tree.all) {
			if (!d._tmpFile) {
				continue;
			}
			known.push(d.tmpFile.leafName);
		}
		let tmpEnum = Prefs.tempLocation.directoryEntries;
		let unknown = [];
		for (let f of new Utils.SimpleIterator(tmpEnum, Ci.nsIFile)) {
			if (f.leafName.match(/\.dtapart$/) && !~known.indexOf(f.leafName)) {
				unknown.push(f);
			}
		}
		for (let f of unknown) {
			try {
				f.remove(false);
			}
			catch (ex) {}
		}
	},
	_safeCloseAttempts: 0,

	unload: function() {
		Limits.killServerBuckets();

		Timers.killAllTimers();
		if (this._loader) {
			this._loader.cancel();
		}
		Prefs.shutdown();
		try {
			this._cleanTmpDir();
		}
		catch(ex) {
			log(LOG_ERROR, "_safeClose", ex);
		}

		// some more gc
		for (let d of Tree._downloads) {
			delete d._icon;
		}
		Tree.clear();
		QueueStore.flush();
		delete window.FileExts;
		this.resetScheduler();
		if (this._mustReload) {
			unload("shutdown");
			try {
				Cu.import("chrome://dta-modules/content/glue.jsm", {});
			}
			catch (ex) {
				// may fail, if the add-on was disabled in between
				// not to worry!
			}
		}
		else {
			require("support/memorypressure").notify();
		}
		return true;
	}
};
addEventListener("load", function DialogInit() {
	removeEventListener("load", DialogInit, false);
	Dialog.init();
}, false);

unloadWindow(window, function () {
	Dialog._forceClose = true;
	Dialog.close();
});

var Metalinker = {
	handleDownload: function(download) {
		let file = download.tmpFile;

		this.handleFile(file, download.referrer, function() {
			try {
				file.remove(false);
			}
			catch (ex) {
				log(LOG_ERROR, "failed to remove metalink file!", ex);
			}
		}, download.isPrivate);

		download.setState(CANCELED);
		Tree.remove(download, false);
	},
	handleFile: function(aFile, aReferrer, aCallback, aIsPrivate) {
		aIsPrivate = !!aIsPrivate || false;
		let aURI = Services.io.newFileURI(aFile);
		this.parse(aURI, aReferrer, function (res, ex) {
			try {
				if (ex) {
					throw ex;
				}
				if (!res.downloads.length) {
					throw new Error(_('ml.nodownloads'));
				}
				for (let e of res.downloads) {
					if (e.size) {
						e.size = Utils.formatBytes(e.size);
					}
					e.fileName = Utils.getUsableFileName(e.fileName);
					e.isPrivate = aIsPrivate;
				}
				window.openDialog(
					'chrome://dta/content/dta/manager/metaselect.xul',
					'_blank',
					'chrome,centerscreen,dialog=yes,modal',
					res.downloads,
					res.info
				);
				filterInSitu(res.downloads, function(d) { return d.selected; });
				if (res.downloads.length) {
					startDownloads(res.info.start, res.downloads);
				}
			}
			catch (e) {
				log(LOG_ERROR, "Metalinker::handleDownload", e);
				if (!(e instanceof Error)) {
					let msg = _('mlerror', [e.message ? e.message : (e.error ? e.error : e.toString())]);
					AlertService.show(_('mlerrortitle'), msg);
				}
				else {
					AlertService.show(_('mlerrortitle'), e.message);
				}
			}
			if (aCallback) {
				aCallback();
			}
		});
	}
};
requireJoined(Metalinker, "support/metalinker");

function QueueItem() {
	this.visitors = new VisitorManager();

	this.chunks = [];
	this.speeds = new SpeedStats(SPEED_COUNT);
	this.rebuildDestination_renamer = createRenamer(this);
}

QueueItem.prototype = {
	state: QUEUED,
	_setStateInternal: function(nv) {
		Object.defineProperty(this, "state", {value: nv, configurable: true, enumerable: true});
	},
	setState: function(nv) {
		if (this.state === nv) {
			return nv;
		}
		if (this.state === RUNNING) {
			// remove ourself from inprogresslist
			Dialog.wasStopped(this);
			// kill the bucket via it's setter
			this.bucket = null;
		}
		else if (this.state === COMPLETE) {
			--Dialog.completed;
		}
		else if (this.state === FINISHING) {
			--Dialog.finishing;
		}
		this.speed = '';
		this._setStateInternal(nv);
		if (this.state === RUNNING) {
			// set up the bucket
			this._bucket = new ByteBucket(this.speedLimit, 1.7);
		}
		else if (this.state === FINISHING) {
			++Dialog.finishing;
			if (!this.totalSize) {
				// We are done now, just set indeterminate size downloads to what we actually downloaded
				this.refreshPartialSize();
				this.totalSize = this.partialSize;
			}
		}
		else if (this.state === COMPLETE) {
			++Dialog.completed;
		}
		Dialog.signal(this);
		this.invalidate();
		Tree.refreshTools();
		return nv;
	},

	_bucket: null,
	get bucket() {
		return this._bucket;
	},
	set bucket(nv) {
		if (nv !== null) {
			throw new Exception("Bucket is only nullable");
		}
		if (this._bucket) {
			this._bucket.kill();
			this._bucket = null;
		}
	},

	_speedLimit: -1,
	get speedLimit() {
		return this._speedLimit;
	},
	set speedLimit(nv) {
		nv = Math.max(nv, -1);
		if (this._speedLimit === nv) {
			return;
		}
		this._speedLimit = nv;
		if (this.state === RUNNING) {
			this._bucket.byteRate = this.speedLimit;
		}
		this.save();
	},
	otherBytes: 0,

	postData: null,

	fromMetalink: false,
	bNum: 0,
	iNum: 0,

	_fileName: null,
	fileNameFromUser: false,
	get fileName() {
		return this._fileName;
	},
	set fileName(nv) {
		if (this._fileName === nv || this.fileNameFromUser) {
			return nv;
		}
		log(LOG_DEBUG, "fn is " + this._fileName + " nv: " + nv);
		this._fileName = nv;
		delete this._fileNameAndExtension;
		this.rebuildDestination();
		this.invalidate(0);
		return nv;
	},
	setUserFileName: function(name) {
		this.fileNameFromUser = false;
		this.fileName = name;
		this.fileNameFromUser = true;
		this.save();
	},
	shortenName: function() {
		let fn = this.destinationName;
		let ext = Utils.getExtension(fn);
		if (ext) {
			fn = fn.substring(0, fn.length - ext.length - 1);
		}
		let nn = fn.substr(0, Math.min(200, Math.max(fn.length - 25, 10)));
		if (nn === fn) {
			return;
		}
		if (ext) {
			nn += "." + ext;
		}
		this.destinationName = nn;
	},
	get fileNameAndExtension() {
		if (!this._fileNameAndExtension) {
			let fn = this.fileName;
			let ext = Utils.getExtension(fn);
			if (ext) {
				fn = fn.substring(0, fn.length - ext.length - 1);

				if (this.contentType && /htm/.test(this.contentType) && !/htm/.test(ext)) {
					ext += ".html";
				}
			}
			// mime-service method
			else if (this.contentType && /^(?:image|text)/.test(this.contentType)) {
				try {
					let info = Services.mime.getFromTypeAndExtension(this.contentType.split(';')[0], "");
					ext = info.primaryExtension;
				} catch (ex) {
					ext = '';
				}
			}
			else {
				fn = this.fileName;
				ext = '';
			}

			this._fileNameAndExtension = {name: fn, extension: ext };
		}
		return this._fileNameAndExtension;
	},
	get referrerUrlManager() {
		if (this.referrer && !this._referrerUrlManager) {
			this._referrerUrlManager = new UrlManager([this.referrer]);
		}
		return this._referrerUrlManager;
	},
	get referrerFileNameAndExtension() {
		if (!this.referrerUrlManager) {
			return null;
		}
		if (!this._referrerFileNameAndExtension) {
			let fn = Utils.getUsableFileName(this.referrerUrlManager.usable);
			let ext = Utils.getExtension(fn);
			if (ext) {
				fn = fn.substring(0, fn.length - ext.length - 1);
			}
			else {
				ext = '';
			}
			this._referrerFileNameAndExtension = {name: fn, extension: ext};
		}
		return this._referrerFileNameAndExtension;
	},
	_description: null,
	get description() {
		return this._description;
	},
	set description(nv) {
		if (nv === this._description) {
			return nv;
		}
		this._description = nv;
		this.rebuildDestination();
		this.invalidate(0);
		return nv;
	},
	_title: '',
	get title() {
		return this._title;
	},
	set title(nv) {
		if (nv === this._title) {
			return this._title;
		}
		this._title = nv;
		this.rebuildDestination();
		this.invalidate(0);
		return this._title;
	},
	_pathName: null,
	get pathName() {
		return this._pathName;
	},
	set pathName(nv) {
		nv = nv.toString();
		if (this._pathName === nv) {
			return nv;
		}
		this._pathName = identity(nv);
		this.rebuildDestination();
		this.invalidate(0);
		return nv;
	},

	_mask: null,
	get mask() {
		return this._mask;
	},
	set mask(nv) {
		if (this._mask === nv) {
			return nv;
		}
		this._mask = identity(Utils.removeFinalSlash(Utils.removeLeadingSlash(Utils.normalizeSlashes(nv))));
		this.rebuildDestination();
		this.invalidate(7);
		return nv;
	},

	_destinationName: null,
	destinationNameOverride: null,
	_destinationNameFull: null,
	get destinationName() {
		return this._destinationNameFull;
	},
	set destinationName(nv) {
		if (this.destinationNameOverride === nv) {
			return this._destinationNameFull;
		}
		this.destinationNameOverride = nv;
		this.rebuildDestination();
		this.invalidate(0);
		return this._destinationNameFull;
	},

	_destinationFile: null,
	get destinationFile() {
		if (!this._destinationFile) {
			this.rebuildDestination();
		}
		return this._destinationFile;
	},

	_destinationLocalFile: null,
	get destinationLocalFile() {
		if (!this._destinationLocalFile) {
			this.rebuildDestination();
		}
		return this._destinationLocalFile;
	},

	_conflicts: 0,
	get conflicts() {
		return this._conflicts;
	},
	set conflicts(nv) {
		if (this._conflicts === nv) {
			return nv;
		}
		this._conflicts = nv;
		this.rebuildDestination();
		this.invalidate(0);
		return nv;
	},
	_tmpFile: null,
	get tmpFile() {
		if (!this._tmpFile) {
			var dest = Prefs.tempLocation ?
				Prefs.tempLocation.clone() :
				new Instances.LocalFile(this.destinationPath);
			let fn = this.fileName;
			if (fn.length > 60) {
				fn = fn.substring(0, 60);
			}
			dest.append(fn + "-" + Utils.newUUIDString() + '.dtapart');
			this._tmpFile = dest;
		}
		return this._tmpFile;
	},
	_hashCollection: null,
	get hashCollection() {
		return this._hashCollection;
	},
	set hashCollection(nv) {
		if (nv && !(nv instanceof DTA.HashCollection)) {
			throw new Exception("Not a hash collection");
		}
		this._hashCollection = nv;
		this._prettyHash = this._hashCollection ?
			_('prettyhash', [this._hashCollection.full.type, this._hashCollection.full.sum]) :
			TextCache_NAS;
	},
	_prettyHash: null,
	get prettyHash() {
		return this._prettyHash;
	},

	is: function(state) {
		return this.state === state;
	},
	isOf: function(states) {
		return (this.state & states) !== 0;
	},
	save: function() {
		if (this.deleting) {
			return false;
		}
		const state = this.state;
		if ((Prefs.removeCompleted && state === COMPLETE) ||
			(Prefs.removeCanceled && state === CANCELED) ||
			(Prefs.removeAborted && state === PAUSED)) {
			if (this.dbId) {
				this.remove();
			}
			return false;
		}
		if (this.isPrivate) {
			return false;
		}
		if (this.dbId) {
			QueueStore.saveDownload(this.dbId, JSON.stringify(this));
			return true;
		}
		this.dbId = QueueStore.queueDownload(JSON.stringify(this), this.position);
		return true;
	},
	remove: function() {
		QueueStore.deleteDownload(this.dbId);
		delete this.dbId;
	},
	position: -1,
	_contentType: "",
	get contentType() {
		return this._contentType;
	},
	set contentType(nv) {
		if (nv === this._contentType) {
			return;
		}
		this._contentType = nv;
		delete this._fileNameAndExtension;
	},
	visitors: null,
	relaxSize: false,
	_totalSize: 0,
	get totalSize() { return this._totalSize; },
	set totalSize(nv) {
		if (nv >= 0 && !isNaN(nv)) {
			this._totalSize = Math.floor(nv);
		}
		this.invalidate(3);
		this.prealloc();
	},
	partialSize: 0,
	progress: 0,
	mustGetInfo: false,

	get startDate() {
		return this._startDate || (this.startDate = new Date());
	},
	set startDate(nv) {
		this._startDate = nv;
	},

	compression: null,

	resumable: true,
	started: false,

	get canResumeLater() {
		return this.resumable && !this.isPrivate;
	},

	_activeChunks: 0,
	get activeChunks() {
		return this._activeChunks;
	},
	set activeChunks(nv) {
		nv = Math.max(0, nv);
		this._activeChunks = nv;
		this.invalidate(6);
		return this._activeChunks;
	},
	_maxChunks: 0,
	get maxChunks() {
		if (!this.urlManager) {
			return Prefs.maxChunks;
		}
		if (!this._maxChunks) {
			let limit = Limits.getLimitFor(this);
			this._maxChunks = (limit ? limit.segments : 0) || Prefs.maxChunks;
		}
		return this._maxChunks;
	},
	set maxChunks(nv) {
		this._maxChunks = nv;
		if (this._maxChunks < this._activeChunks) {
			let running = this.chunks.filter(function(c) { return c.running; });
			while (running.length && this._maxChunks < running.length) {
				let c = running.pop();
				if (c.remainder < 10240) {
					continue;
				}
				c.cancelChunk();
			}
		}
		else if (this._maxChunks > this._activeChunks && this.state === RUNNING) {
			this.resumeDownload();

		}
		this.invalidate(6);
		log(LOG_DEBUG, "mc set to " + nv);
		return this._maxChunks;
	},
	timeLastProgress: 0,
	timeStart: 0,

	_icon: null,
	get iconProp() {
		if (!this._icon) {
			let icon = FileExts.getAtom(this.destinationName, 'metalink' in this).toString();
			this._icon = identity((this.isPrivate ? "iconic private file " : "iconic file ") + icon);
		}
		return this._icon;
	},
	get largeIcon() {
		return getLargeIcon(this.destinationName, 'metalink' in this);
	},
	get dimensionString() {
		if (this.partialSize <= 0) {
			return TextCache_UNKNOWN;
		}
		else if (this.totalSize <= 0) {
			return _('transfered', [Utils.formatBytes(this.partialSize), TextCache_NAS]);
		}
		else if (this.state === COMPLETE || this.state === FINISHING) {
			return Utils.formatBytes(this.totalSize);
		}
		return _('transfered', [Utils.formatBytes(this.partialSize), Utils.formatBytes(this.totalSize)]);
	},
	_status : '',
	get status() {
		if (Dialog.offline && this.isOf(QUEUED | PAUSED)) {
			return TextCache_OFFLINE;
		}
		return this._status + (this.autoRetrying ? ' *' : '');
	},
	set status(nv) {
		if (nv !== this._status) {
			this._status = nv;
			this.invalidate();
		}
		return this._status;
	},
	get parts() {
		if (this.maxChunks) {
			return (this.activeChunks) + '/' + this.maxChunks;
		}
		return '';
	},
	get percent() {
		const state = this.state;
		if (!this.totalSize && state === RUNNING) {
			return TextCache_NAS;
		}
		else if (!this.totalSize) {
			return "0%";
		}
		else if (state === COMPLETE) {
			return "100%";
		}
		return this.progress + "%";
	},
	_destinationPath: '',
	get destinationPath() {
		return this._destinationPath;
	},

	invalidate: function(cell) {
		Tree.invalidate(this, cell);
	},

	safeRetry: function() {
		// reset flags
		this.progress = this.totalSize = this.partialSize = 0;
		this.compression = null;
		this.activeChunks = this.maxChunks = 0;
		for (let c of this.chunks) {
			c.cancelChunk();
		}
		this.chunks.length = 0;
		this.speeds.clear();
		this.otherBytes = 0;
		this.visitors = new VisitorManager();
		this.setState(QUEUED);
		Dialog.run(this);
	},

	refreshPartialSize: function(){
		let size = 0;
		for (let i = 0, e = this.chunks.length; i < e; ++i) {
			size += this.chunks[i].written;
		}
		if (isNaN(size) || size < 0) {
			if (log.enabled) {
				log(LOG_ERROR, "Bug: invalid partial size!", size);
				for (let [i,c] in Iterator(this.chunks)) {
					log(LOG_DEBUG, "Chunk " + i + ": " + c);
				}
			}
		}
		else {
			this.partialSize = size;
			this.progress = this._totalSize && Math.floor(size * 100.0 / this._totalSize);
			if (!this._totalSize && this.state === FINISHING) {
				this.progress = 100;
			}
		}
	},

	pause: function(){
		this.setState(PAUSED);
		if (this.chunks) {
			for (let c of this.chunks) {
				if (c.running) {
					c.pauseChunk();
				}
			}
		}
		this.activeChunks = 0;
		this.speeds.clear();
		this.otherBytes = 0;
	},
	moveCompleted: function*() {
		if (this.state === CANCELED) {
			throw Error("Cannot move incomplete file");
		}
		this.status = TextCache_MOVING;

		let pinned = (yield this.resolveConflicts());
		if (!pinned) {
			return;
		}
		try {
			let destination = new Instances.LocalFile(this.destinationPath);
			yield Utils.makeDir(destination, Prefs.dirPermissions);
			log(LOG_INFO, this.fileName + ": Move " + this.tmpFile.path + " to " + this.destinationFile);
			// move file
			if (this.compression) {
				this.status = TextCache_DECOMPRESSING;
				yield new Promise(function(resolve, reject) {
					new Decompressor(this, function(ex) {
						if (ex) {
							reject(ex);
						}
						else {
							resolve(true);
						}
					});
				}.bind(this));
				return true;
			}
			yield _moveFile(destination, this);
			return true;
		}
		finally {
			ConflictManager.unpin(pinned);
		}
		return false;
	},
	handleMetalink: function() {
		try {
			Metalinker.handleDownload(this);
		}
		catch (ex) {
			log(LOG_ERROR, "handleMetalink", ex);
		}
	},
	verifyHash: function() {
		this.status = TextCache_VERIFYING;
		return Task.spawn((function*() {
			let mismatches = yield Verificator.verify(
				(yield OS.File.exists(this.tmpFile.path)) ? this.tmpFile.path : this.destinationFile,
				this.hashCollection,
				(function(progress) {
					this.partialSize = progress;
					this.invalidate();
				}).bind(this));
			if (!mismatches) {
				log(LOG_ERROR, "hash not computed");
				Prompts.alert(window, _('error', ["Metalink"]), _('verificationfailed', [this.destinationFile]));
				return true;
			}
			else if (mismatches.length) {
				log(LOG_ERROR, "Mismatches: " + mismatches.toSource());
				return (yield this.verifyHashError(mismatches));
			}
			return true;
		}).bind(this));
	},
	verifyHashError: function(mismatches) {
		let file = this.destinationLocalFile;

		return Task.spawn((function*() {
			function* deleteFile() {
				try {
					yield OS.File.remove(file.path);
				}
				catch (ex if ex.becauseNoSuchFile) {
					// no op
				}
			}

			function recoverPartials(download) {
				// merge
				for (let i = mismatches.length - 1; i > 0; --i) {
					if (mismatches[i].start === mismatches[i-1].end + 1) {
						mismatches[i-1].end = mismatches[i].end;
						mismatches.splice(i, 1);
					}
				}
				let chunks = [];
				let next = 0;
				for (let mismatch of mismatches) {
					if (next !== mismatch.start) {
						chunks.push(new Chunk(download, next, mismatch.start - 1, mismatch.start - next));
					}
					chunks.push(new Chunk(download, mismatch.start, mismatch.end));
					next = mismatch.end + 1;
				}
				if (next !== download.totalSize) {
					log(LOG_DEBUG, "Inserting last");
					chunks.push(new Chunk(download, next, download.totalSize - 1, download.totalSize - next));
				}
				download.chunks = chunks;
				download.refreshPartialSize();
				download.queue();
			}

			filterInSitu(mismatches, e => e.start !== e.end);

			if (mismatches.length && (yield OS.File.exists(this.tmpFile.path))) {
				// partials
				let act = Prompts.confirm(
					window,
					_('verifyerror.title'),
					_('verifyerror.partialstext'),
					_('recover'),
					_('delete'),
					_('keep'));
				switch (act) {
					case 0:
						yield deleteFile();
						recoverPartials(this, mismatches);
						return false;
					case 1:
						yield deleteFile();
						this.cancel();
						return false;
				}
				return true;
			}
			let act = Prompts.confirm(
				window,
				_('verifyerror.title'),
				_('verifyerror.text'),
				_('retry'),
				_('delete'),
				_('keep'));
			switch (act) {
				case 0:
					yield deleteFile();
					this.safeRetry();
					return false;
				case 1:
					yield deleteFile();
					this.cancel();
					return false;
			}
			return true;
		}).bind(this));
	},
	customFinishEvent: function() {
		new CustomAction(this, Prefs.finishEvent);
	},
	setAttributes: function*() {
		if (Prefs.setTime) {
			// XXX: async API <https://bugzilla.mozilla.org/show_bug.cgi?id=924916>
			try {
				let time = this.startDate.getTime();
				try {
					time = this.visitors.time;
				}
				catch (ex) {
					log(LOG_DEBUG, "no visitors time", ex);
				}
				// small validation. Around epoche? More than a month in future?
				if (time < 2 || time > Date.now() + 30 * 86400000) {
					throw new Exception("invalid date encountered: " + time + ", will not set it");
				}
				// have to unwrap
				this.destinationLocalFile.lastModifiedTime = time;
			}
			catch (ex) {
				log(LOG_ERROR, "Setting timestamp on file failed: ", ex);
			}
		}
		let file = null;
		if (!this.isOf(COMPLETE | FINISHING)) {
			file = this._tmpFile || null;
		}
		else {
			file = this.destinationLocalFile;
		}
		try {
			this.totalSize = this.partialSize = (yield OS.File.stat(file.path)).size;
		}
		catch (ex) {
			log(LOG_ERROR, "failed to get filesize for " + file.path, ex);
			this.totalSize = this.partialSize = 0;
		}
		return true;
	},
	closeChunks: function*() {
		if (!this.chunks) {
			return;
		}
		for (let c of this.chunks) {
			yield c.close();
		}
	},
	_criticals: 0,
	get isCritical() {
		return this._criticals !== 0;
	},
	critical: function() {
		this._criticals++;
	},
	uncritical: function() {
		this._criticals = Math.max(0, this._criticals + 1);
	},
	finishDownload: function(exception) {
		if (this._finishDownloadTask) {
			return;
		}
		log(LOG_DEBUG, "finishDownload, connections: " + this.sessionConnections);

		// Last speed update
		this.refreshPartialSize();
		Dialog._sum += this.speeds.add(this.partialSize + this.otherBytes, Utils.getTimestamp());
		if (!this.partialSize) {
			log(LOG_ERROR, "INVALID SIZE!!!!!");
			d.fail(_("accesserror"), _("accesserror.long"), _("accesserror"));
			return;
		}

		this._finishDownloadTask = Task.spawn(function* finishDownloadTask() {
			try {
				this.setState(FINISHING);
				yield this.closeChunks();
				if (this.hashCollection && !(yield this.verifyHash())) {
					return;
				}
				if ("isMetalink" in this) {
					this.handleMetalink();
					return;
				}
				if (!(yield this.moveCompleted())) {
					log(LOG_DEBUG, "moveCompleted scheduled!");
					return;
				}
				yield this.setAttributes();
				if (Prefs.finishEvent) {
					this.customFinishEvent();
				}
				this.chunks.length = 0;
				this.speeds.clear();
				this.activeChunks = 0;
				this.setState(COMPLETE);
				this.status = TextCache_COMPLETE;
				this.visitors = new VisitorManager();
				this.compression = null;
			}
			catch (ex) {
				log(LOG_ERROR, "complete: ", ex);
				this.fail(_("accesserror"), _("accesserror.long"), _("accesserror"));
			}
			finally {
				delete this._finishDownloadTask;
			}
		}.bind(this));
	},
	get maskURL() {
		return this.urlManager.usableURL;
	},
	get maskCURL() {
		return Utils.getCURL(this.maskURL);
	},
	get maskURLPath() {
		return this.urlManager.usableURLPath;
	},
	get maskReferrerURL() {
		return this.referrerUrlManager.usableURL;
	},
	get maskReferrerURLPath() {
		return this.referrerUrlManager.usableURLPath;
	},
	get maskReferrerCURL() {
		return Utils.getCURL(this.maskReferrerURL);
	},
	rebuildDestination: function() {
		try {
			let mask = Utils.removeFinalSlash(Utils.normalizeSlashes(Utils.removeFinalChar(
					this.rebuildDestination_renamer(this.mask), "."
					)));
			let file = new Instances.LocalFile(Utils.addFinalSlash(this.pathName));
			if (!~mask.indexOf(Utils.SYSTEMSLASH)) {
				file.append(Utils.removeBadChars(mask).trim());
			}
			else {
				mask = mask.split(Utils.SYSTEMSLASH);
				for (let i = 0, e = mask.length; i < e; ++i) {
					file.append(Utils.removeBadChars(mask[i]).trim());
				}
			}
			this._destinationName = file.leafName;
			let pd = file.parent;
			this._destinationPath = identity(pd.path);
			this._destinationNameFull = Utils.formatConflictName(
					this.destinationNameOverride ? this.destinationNameOverride : this._destinationName,
					this.conflicts
				);
			pd.append(this.destinationName);
			this._destinationFile = pd.path;
			this._destinationLocalFile = pd;
		}
		catch(ex) {
			this._destinationName = this.fileName;
			this._destinationPath = Utils.addFinalSlash(this.pathName);
			this._destinationNameFull = Utils.formatConflictName(
					this.destinationNameOverride || this._destinationName,
					this.conflicts
				);
			let file = new Instances.LocalFile(this.destinationPath);
			file.append(this.destinationName);
			this._destinationFile = file.path;
			this._destinationLocalFile = file;
			log(LOG_ERROR, "rebuildDestination():", ex);
		}
		this._icon = null;
	},
	resolveConflicts: function() {
		return ConflictManager.resolve(this);
	},
	fail: function(title, msg, state) {
		log(LOG_INFO, "failDownload invoked");

		this.cancel(state);

		if (Prefs.soundsError) {
			$("sound_error").play();
		}

		switch (Prefs.alertingSystem) {
			case 1:
				AlertService.show(title, msg);
				break;
			case 0:
				window.alert(msg);
				break;
		}
	},

	cancel: function(message) {
		try {
			const state = this.state;
			if (state === RUNNING) {
				if (this.chunks) {
					// must set state here, already, to avoid confusing the connections
					this.setState(CANCELED);
					for (let c of this.chunks) {
						if (c.running) {
							c.cancelChunk();
						}
					}
				}
				this.activeChunks = 0;
			}
			this.setState(CANCELED);
			Task.spawn(function*() {
				try {
					yield this.closeChunks();
					if (this._preallocTask) {
						yield this._preallocTask;
					}
					log(LOG_INFO, this.fileName + ": canceled");

					this.shutdown();
					this.removeTmpFile();

					// gc
					if (this.deleting) {
						return;
					}
					if (!message) {
						message = _("canceled");
					}

					this.status = message;
					this.visitors = new VisitorManager();
					this.chunks.length = 0;
					this.progress = this.totalSize = this.partialSize = 0;
					this.conflicts = 0;
					this.resumable = true;
					this._maxChunks = this._activeChunks = 0;
					this._autoRetries = 0;
					delete this._autoRetryTime;
					this.speeds.clear();
					this.otherBytes = 0;
					this.save();
				}
				catch (ex) {
					log(LOG_ERROR, "cancel() Task", ex);
				}
			}.bind(this));
		}
		catch(ex) {
			log(LOG_ERROR, "cancel():", ex);
		}
	},

	cleanup: function() {
		Task.spawn(function*() {
			if (this.chunks) {
				yield this.closeChunks();
			}
			delete this.visitors;
			delete this.chunks;
			delete this.speeds;
			delete this.urlManager;
			delete this.referrer;
			delete this._referrerUrlManager;
			delete this._destinationLocalFile;
			delete this._tmpFile;
			delete this.rebuildDestination_renamer;
		}.bind(this));
	},
	prealloc: function() {
		let file = this.tmpFile;

		if (this.state !== RUNNING) {
			return;
		}

		if (!this.totalSize) {
			log(LOG_DEBUG, "pa: no totalsize");
			return;
		}
		if (this.preallocating) {
			log(LOG_DEBUG, "pa: already working");
			return;
		}

		this.preallocating = true;
		this._preallocTask = Task.spawn(function*() {
			try {
				try {
					yield Utils.makeDir(file.parent, Prefs.dirPermissions);
				}
				catch (ex if ex.becauseExists) {
					// no op
				}
				try {
					if (this.totalSize === (yield OS.File.stat(file.path)).size) {
						log(LOG_INFO, "pa: already allocated");
						return;
					}
				}
				catch (ex if ex.becauseNoSuchFile) {
					// no op
				}
				let pa = Preallocator.prealloc(
					file,
					this.totalSize,
					Prefs.permissions,
					Prefs.sparseFiles
					);
				if (pa) {
					yield pa;
					log(LOG_INFO, "pa: done");
				}
				else {
					log(LOG_INFO, "pa: not preallocating");
				}
			}
			catch(ex) {
				log(LOG_ERROR, "pa: failed", ex);
			}
			this._preallocTask = null;
			this.preallocating = false;
			this.maybeResumeDownload();
		}.bind(this));
	},

	shutdown: function() {
	},

	removeTmpFile: function() {
		let tmpFile = this._tmpFile;
		delete this._tmpFile;
		if (!tmpFile) {
			return;
		}
		Task.spawn(function*() {
			try {
				yield OS.File.remove(tmpFile.path);
			} catch (ex if ex.becauseNoSuchFile) {
				// no op
			}
		}).then(null, function(ex) {
			log(LOG_ERROR, "failed to remove tmpfile: " + tmpFile.path, ex);
		});
	},

	sessionConnections: 0,
	_autoRetries: 0,
	_autoRetryTime: 0,
	get autoRetrying() {
		return !!this._autoRetryTime;
	},
	pauseAndRetry: function() {
		let retry = this.state === RUNNING;
		this.pause();
		this.resumable = true;

		if (retry && Prefs.autoRetryInterval && !(Prefs.maxAutoRetries && Prefs.maxAutoRetries <= this._autoRetries)) {
			Dialog.markAutoRetry(this);
			this._autoRetryTime = Utils.getTimestamp();
			log(LOG_INFO, "marked auto-retry: " + this);
		}
		this.save();
	},
	autoRetry: function() {
		if (!this.autoRetrying || Utils.getTimestamp() - (Prefs.autoRetryInterval * 1000) < this._autoRetryTime) {
			return false;
		}

		this._autoRetryTime = 0;
		++this._autoRetries;
		this.queue();
		log(LOG_DEBUG, "Requeued due to auto-retry: " + this);
		return true;
	},
	clearAutoRetry: function() {
		this._autoRetryTime = 0;
		this._autoRetries = 0;
	},
	queue: function() {
		this._autoRetryTime = 0;
		this.setState(QUEUED);
		this.status = TextCache_QUEUED;
	},
	maybeResumeDownload: function() {
		if (this.state !== RUNNING) {
			return;
		}
		this.resumeDownload();
	},
	resumeDownload: function() {
		log(LOG_DEBUG, "resumeDownload: " + this);
		function cleanChunks(d) {
			// merge finished chunks together, so that the scoreboard does not bloat
			// that much
			for (let i = d.chunks.length - 2; i > -1; --i) {
				let c1 = d.chunks[i], c2 = d.chunks[i + 1];
				if (c1.complete && c2.complete && !c1.buffered && !c2.buffered) {
					c1.merge(c2);
					d.chunks.splice(i + 1, 1);
				}
			}
		}
		function downloadNewChunk(download, start, end, header) {
			var chunk = new Chunk(download, start, end);
			download.chunks.push(chunk);
			download.chunks.sort(function(a,b) { return a.start - b.start; });
			downloadChunk(download, chunk, header);
		}
		function downloadChunk(download, chunk, header) {
			chunk.download = new Connection(download, chunk, header || download.mustGetInfo);
			chunk.running = true;
			download.mustGetInfo = false;
			download.setState(RUNNING);
			log(LOG_DEBUG, "started: " + chunk);
			++download.activeChunks;
			++download.sessionConnections;
		}

		cleanChunks(this);

		try {
			if (Dialog.offline || this.maxChunks <= this.activeChunks) {
				return false;
			}

			var rv = false;

			// we didn't load up anything so let's start the main chunk (which will
			// grab the info)
			if (!this.chunks.length) {
				downloadNewChunk(this, 0, 0, true);
				this.sessionConnections = 0;
				return false;
			}


			// start some new chunks
			let paused = this.chunks.filter(chunk => !(chunk.running || chunk.complete));

			while (this.activeChunks < this.maxChunks) {
				if (this.preallocating && this.activeChunks) {
					log(LOG_DEBUG, "not resuming download " + this + " because preallocating");
					return true;
				}

				// restart paused chunks
				if (paused.length) {
					let p = paused.shift();
					downloadChunk(this, p, p.end === 0);
					rv = true;
					continue;
				}

				if (this.chunks.length === 1 &&
					!!Prefs.loadEndFirst &&
					this.chunks[0].remainder > 3 * Prefs.loadEndFirst) {
					// we should download the end first!
					let c = this.chunks[0];
					let end = c.end;
					c.end -= Prefs.loadEndFirst;
					downloadNewChunk(this, c.end + 1, end);
					rv = true;
					continue;
				}

				// find biggest chunk
				let biggest = null;
				for (let chunk of this.chunks) {
					if (chunk.running && chunk.remainder > MIN_CHUNK_SIZE * 2) {
						if (!biggest || biggest.remainder < chunk.remainder) {
							biggest = chunk;
						}
					}
				}

				// nothing found, break
				if (!biggest) {
					break;
				}
				let end = biggest.end;
				biggest.end = biggest.start + biggest.written + Math.floor(biggest.remainder / 2);
				downloadNewChunk(this, biggest.end + 1, end);
				rv = true;
			}

			return rv;
		}
		catch(ex) {
			log(LOG_ERROR, "resumeDownload():", ex);
		}
		return false;
	},
	replaceMirrors: function(mirrors) {
		let restart = this.urlManager.length < 3;
		this.urlManager.initByArray(mirrors);
		if (restart && this.resumable && this.state === RUNNING && this.maxChunks > 2) {
			// stop some chunks and restart them
			log(LOG_DEBUG, "Stopping some chunks and restarting them after mirrors change");
			let omc = this.maxChunks;
			this.maxChunks = 2;
			this.maxChunks = omc;
		}
		this.invalidate();
		this.save();
	},
	dumpScoreboard: function() {
		if (!log.enabled) {
			return;
		}
		let scoreboard = "";
		let len = this.totalSize.toString().length;
		for (let [i,c] in Iterator(this.chunks)) {
			scoreboard += i + ": " + c + "\n";
		}
		log(LOG_DEBUG, "scoreboard\n" + scoreboard);
	},
	toString: function() {
		return this.urlManager.usable;
	},
	toJSON: function() {
		let rv = Object.create(null);
		let p = Object.getPrototypeOf(this);
		for (let u of Dialog_serialize_props) {
			// only save what is changed
			if (p[u] !== this[u]) {
				rv[u] = this[u];
			}
		}
		if (this._maxChunks) {
			rv.maxChunks = this.maxChunks;
		}
		if (this.hashCollection) {
			rv.hashCollection = this.hashCollection;
		}
		if (this.autoRetrying || this.state === RUNNING) {
			rv.state = QUEUED;
		}
		else {
			rv.state = this.state;
		}
		if (this.destinationNameOverride) {
			rv.destinationName = this.destinationNameOverride;
		}
		if (this.referrer) {
			rv.referrer = this.referrer.spec;
		}
		rv.numIstance = this.bNum;
		rv.iNum = this.iNum;
		// Store this so we can later resume.
		if (!this.isOf(CANCELED | COMPLETE) && this.partialSize) {
			rv.tmpFile = this.tmpFile.path;
		}
		rv.startDate = this.startDate.getTime();

		rv.urlManager = this.urlManager;
		rv.visitors = this.visitors;

		if (!this.resumable && this.state !== COMPLETE) {
			rv.totalSize = 0;
		}
		else {
			rv.totalSize = this.totalSize;
		}
		if (this.isOf(RUNNING | PAUSED | QUEUED) && this.resumable) {
			rv.chunks = this.chunks;
		}
		return rv;
	}
};

XPCOMUtils.defineLazyGetter(QueueItem.prototype, 'AuthPrompts', function() {
	const {LoggedPrompter} = require("support/loggedPrompter");
	return new LoggedPrompter(window);
});

var ConflictManager = {
	_items: new Map(),
	_queue: [],
	_pinned: new Set(),
	resolve: function(download) {
		log(LOG_DEBUG, "ConflictManager: Resolving " + download);
		let promise = this._items.get(download);
		if (promise) {
			log(LOG_DEBUG, "ConflictManager: Resolving already " + promise);
			return promise.promise;
		}
		promise = {};
		promise.promise = new Promise(function(resolve, reject) {
			promise.reject = reject;
			promise.resolve = resolve;
		});
		this._items.set(download, promise);
		this._queue.push(download);
		log(LOG_DEBUG, "ConflictManager: Resolving new " + promise);
		this._processNext();
		return promise.promise;
	},
	pin: function(name) {
		this._pinned.add(name);
	},
	unpin: function(name) {
		this._pinned.delete(name);
	},
	_processNext: function() {
		log(LOG_DEBUG, "ConflictManager: Resolving next");
		if (this._processing) {
			log(LOG_DEBUG, "ConflictManager: Resolving rescheduling");
			return;
		}
		let download = this._queue.shift();
		if (!download) {
			return;
		}
		let p = this._items.get(download);
		this._items.delete(download);

		this._processing = true;
		Task.spawn(function*() {
			try {
				p.resolve(yield this._processOne(download));
			}
			catch (ex) {
				log(LOG_ERROR, "ConflictManager: Failed to resolve", ex);
				p.reject(null);
			}
			finally {
				this._processing = false;
				setTimeoutOnlyFun(this._processNext.bind(this), 0);
			}
		}.bind(this));
	},
	_processOne: function*(download) {
		log(LOG_DEBUG, "ConflictManager: Starting conflict resolution for " + download);
		let dest = download.destinationLocalFile;
		let exists = this._pinned.has(dest.path);
		if (!exists) {
			exists = yield OS.File.exists(dest.path);
			// recheck
			exists = exists || this._pinned.has(dest.path);
		}
		if (!exists) {
			log(LOG_DEBUG, "ConflictManager: Does not exist " + download);
			this.pin(dest.path);
			return dest.path;
		}

		let cr = -1;

		let conflicts = download.conflicts || 0;
		let basename = download.destinationName;
		let newDest = download.destinationLocalFile.clone();

		if (Prefs.conflictResolution !== 3) {
			cr = Prefs.conflictResolution;
		}
		else if (download.shouldOverwrite) {
			cr = 1;
		}
		else if ('_sessionSetting' in this) {
			cr = this._sessionSetting;
		}

		if (cr < 0) {
			let dialog = {};
			dialog.promise = new Promise(function(resolve, reject) {
				dialog.resolve = resolve;
				dialog.reject = reject;
			});
			for (;; ++conflicts) {
				newDest.leafName = Utils.formatConflictName(basename, conflicts);
				exists = this._pinned.has(newDest.path);
				if (!exists) {
					exists = yield OS.File.exists(newDest.path);
					// recheck
					exists = exists || this._pinned.has(newDest.path);
				}
				if (!exists) {
					break;
				}
			}
			let options = {
				url: Utils.cropCenter(download.urlManager.usable, 45),
				fn: Utils.cropCenter(newDest.leafName, 45),
				newDest: Utils.cropCenter(newDest.leafName, 45)
			};
			window.openDialog(
				"chrome://dta/content/dta/manager/conflicts.xul",
				"_blank",
				"chrome,centerscreen,resizable=no,dialog,close=no,dependent",
				options, dialog
				);
			let ctype = 0;
			[cr, ctype] = yield dialog.promise;

			if (ctype === 1) {
				this._sessionSetting = cr;
			}
			else if (ctype === 2) {
				Preferences.setExt('conflictresolution', cr);
			}
		}

		switch (cr) {
			case 0: {
				for (;; ++conflicts) {
					newDest.leafName = Utils.formatConflictName(basename, conflicts);
					exists = this._pinned.has(newDest.path);
					if (!exists) {
						exists = yield OS.File.exists(newDest.path);
						// recheck
						exists = exists || this._pinned.has(newDest.path);
					}
					if (!exists) {
						break;
					}
				}
				download.conflicts = conflicts;
				let pinned = download.destinationFile;
				this.pin(pinned);
				log(LOG_DEBUG, "ConflictManager: resolved setting conflicts for " + download);
				return pinned;
			}
			case 1: {
				let pinned = download.destinationFile;
				this.pin(pinned);
				download.shouldOverwrite = true;
				return pinned;
			}
			default:
				download.cancel(_('skipped'));
				return false;
		}
	}
};

function CustomAction(download, command) {
	try {
		// may I introduce you to a real bastard way of commandline parsing?! :p
		var uuids = {};
		let callback = function (u) {
			u = u.substr(1, u.length - 2);
			let id = Utils.newUUIDString();
			uuids[id] = u;
			return id;
		};
		let mapper = function(arg, i) {
			if (arg === "%f") {
				if (!i) {
					throw new Error("Will not execute the file itself");
				}
				arg = download.destinationFile;
			}
			else if (arg in uuids) {
				arg = uuids[arg];
			}
			return arg;
		};
		var args = mapInSitu(
			command
				.replace(/(["'])(.*?)\1/g, callback)
				.split(/ /g),
			mapper);
		var program = new Instances.LocalFile(args.shift());
		var process = new Instances.Process(program);
		process.run(false, args, args.length);
	}
	catch (ex) {
		log(LOG_ERROR, "failed to execute custom event", ex);
		window.alert("failed to execute custom event", ex);
	}
	download.complete();
}

var startDownloads = (function() {
	const series = {};
	lazy(series, "num", function() {
		let rv = DTA.currentSeries();
		DTA.incrementSeries();
		return rv;
	});
	let busy = false;
	let queue = [];

	let next = function (start, downloads, scroll) {
		busy = true;

		let iNum = 0;
		let first = null;
		let g = downloads;
		if ('length' in downloads) {
			g = (function*() {
				for (let i of downloads) {
					yield i;
				}
			})();
		}

		let addItem = function(e) {
			try {
				let qi = new QueueItem();
				let lnk = e.url;
				if (typeof lnk === 'string') {
					qi.urlManager = new UrlManager([new DTA.URL(Services.io.newURI(lnk, null, null))]);
				}
				else if (lnk instanceof UrlManager) {
					qi.urlManager = lnk;
				}
				else {
					qi.urlManager = new UrlManager([lnk]);
				}
				qi.bNum = e.numIstance || series.num;
				qi.iNum = ++iNum;

				if (e.referrer) {
					try {
						if (typeof(e.referrer) === "string") {
							qi.referrer = toURL(e.referrer);
						}
						else if (e.referrer.spec) {
							qi.referrer = toURL(e.referrer.spec);
						}
						else if (e.referrer.url && e.referrer.url.spec) {
							qi.referrer = toURL(e.referrer.url.spec);
						}
						else {
							throw new Error("Don't know how to handle");
						}
					}
					catch (ex) {
						log(LOG_ERROR, "Failed to ref", ex);
						// We might have been fed with about:blank or other crap. so ignore.
					}
				}
				// only access the setter of the last so that we don't generate stuff trice.
				qi._pathName = identity(Utils.addFinalSlash(e.dirSave));
				qi._description = identity(!!e.description ? e.description : '');
				qi._title = identity(!!e.title ? e.title : '');
				qi._mask = identity(Utils.removeFinalSlash(Utils.removeLeadingSlash(Utils.normalizeSlashes(e.mask))));
				qi.fromMetalink = !!e.fromMetalink;
				if (e.fileName) {
					qi._fileName = Utils.getUsableFileName(e.fileName);
					qi.fileNameFromUser = true;
				}
				else {
					qi._fileName = Utils.getUsableFileName(qi.urlManager.usable);
				}
				if (e.destinationName) {
					qi._destinationNameOverride = Utils.getUsableFileName(e.destinationName);
				}
				if (e.startDate) {
					qi.startDate = e.startDate;
				}

				// hash?
				if (e.hashCollection) {
					qi.hashCollection = e.hashCollection;
				}
				else if (e.url.hashCollection) {
					qi.hashCollection = e.url.hashCollection;
				}
				else if (e.hash) {
					qi.hashCollection = new DTA.HashCollection(e.hash);
				}
				else if (e.url.hash) {
					qi.hashCollection = new DTA.HashCollection(e.url.hash);
				}
				else {
					qi.hashCollection = null; // to initialize prettyHash
				}

				qi.isPrivate = !!e.isPrivate || false;

				let postData = ContentHandling.getPostDataFor(qi.urlManager.url, qi.isPrivate);
				if (e.url.postData) {
					postData = e.url.postData;
				}
				if (postData) {
					qi.postData = postData;
				}

				qi.cleanRequest = !!e.cleanRequest || false;

				if (start) {
					qi._setStateInternal(QUEUED);
					qi.status = TextCache_QUEUED;
				}
				else {
					qi._setStateInternal(PAUSED);
					qi.status = TextCache_PAUSED;
				}

				if (!("isPrivate" in e)) {
					log(LOG_INFO,
							"A queued item has no isPrivate property. Defaulting to false. " +
							"Please check the code path for proper PBM support!");
				}

				qi.rebuildDestination();
				RequestManipulation.modifyDownload(qi);
				Tree.add(qi);
				qi.save();
				first = first || qi;
			}
			catch (ex) {
				log(LOG_ERROR, "addItem", ex);
			}

			return true;
		};

		Tree.beginUpdate();
		QueueStore.beginUpdate();
		let ct = new CoThreadListWalker(
			addItem,
			g,
			-1
		).start(function() {
			QueueStore.endUpdate();
			Tree.invalidate();
			Tree.endUpdate();
			ct = null;
			g = null;
			if (scroll && Prefs.scrollToNew) {
				Tree.scrollToNearest(first);
			}

			while (queue.length) {
				try {
					let {start, downloads, scrollNext} = queue.shift();
					next(start, downloads, scrollNext);
					return;
				}
				catch (ex) {
					log(LOG_ERROR, "Failed to run next startDownloads", ex);
				}
			}
			busy = false;
		});
	};

	return function startDownloads(start, downloads, scroll) {
		scroll = !(scroll === false);
		if (busy) {
			queue.push({start: start, downloads: downloads, scroll: scroll});
		}
		else {
			next(start, downloads, scroll);
		}
	};
})();

addEventListener(
	"load",
	function  minimize_on_load() {
		removeEventListener("load", minimize_on_load, false);
		if (!Preferences.getExt('startminimized', false)) {
			return;
		}
		if (!window.arguments || !window.arguments[0]) {
			return;
		}
		setTimeoutOnlyFun(
			function() {
				try {
					window.QueryInterface(Ci.nsIDOMChromeWindow).minimize();
					if (window.opener) {
						window.opener.focus();
					}
				}
				catch (ex) {
				}
			},
			0
		);
	},
	false
);
