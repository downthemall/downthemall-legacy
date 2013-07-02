/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {CoThreadListWalker} = require("support/cothreads");
const Prompts = require("prompts");
const {ByteBucket} = require("support/bytebucket");
const {GlobalBucket} = require("manager/globalbucket");
const {defer} = require("support/defer");
const PrivateBrowsing = require("support/pbm");
const {TimerManager} = require("support/timers");
const {ContentHandling} = require("support/contenthandling");
const {asyncMoveFile} = require("manager/asyncmovefile");
const GlobalProgress = new (require("manager/globalprogress").GlobalProgress)(window);
const RequestManipulation = require("support/requestmanipulation");
const Limits = require("support/serverlimits");
const {QueueStore} = require("manager/queuestore");
const {SpeedStats} = require("manager/speedstats");
const {FileExtensionSheet} = require("support/fileextsheet");
const {UrlManager} = require("support/urlmanager");
const {VisitorManager} = require("manager/visitormanager");
const Preallocator = require("manager/preallocator");
const {Chunk, hintChunkBufferSize} = require("manager/chunk");
const {Connection} = require("manager/connection");
const {createRenamer} = require("manager/renamer");

XPCOMUtils.defineLazyGetter(this, "Version", function() require("version"));
XPCOMUtils.defineLazyGetter(this, "AlertService", function() require("support/alertservice"));
XPCOMUtils.defineLazyGetter(this, "Decompressor", function() require("manager/decompressor").Decompressor);
XPCOMUtils.defineLazyGetter(this, "Verificator", function() require("manager/verificator"));
XPCOMUtils.defineLazyGetter(this, "FileExts", function() new FileExtensionSheet(window));

addEventListener("load", function load_textCache() {
	removeEventListener("load", load_textCache, false);
	const texts = ['paused', 'queued', 'complete', 'canceled', 'nas', 'unknown', 'offline', 'timeout', 'starting', 'decompressing', 'verifying', 'moving'];
	for (let i = 0, text; i < texts.length; ++i) {
		text = texts[i];
		window["TextCache_" + text.toUpperCase()] = _(text);
	}
}, false);


function dieEarly() {
	window.removeEventListener("unload", dieEarly, false);
	let evt = document.createEvent("Event");
	evt.initEvent("DTA:diedEarly", true, false);
	window.dispatchEvent(evt);
}
window.addEventListener("unload", dieEarly, false);

var Timers = new TimerManager();

const Dialog_loadDownloads_props = ['contentType', 'conflicts', 'postData', 'destinationName', 'resumable', 'compression', 'fromMetalink', 'speedLimit'];
function Dialog_loadDownloads_get(down, attr, def) (attr in down) ? down[attr] : (def ? def : '');

const Dialog_serialize_props = ['fileName', 'fileNameFromUser', 'postData', 'description', 'title', 'resumable', 'mask', 'pathName', 'compression', 'contentType', 'conflicts', 'fromMetalink', 'speedLimit'];

const Dialog = {
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
	totalbytes: 0,
	init: function() {
		Prefs.init();

		this.statusText = $("statusText");
		this.statusSpeed = $("statusSpeed");

		// Set tooltip texts for each tb button lacking one (copy label)
		(function addTooltips() {
			for (let e of Array.map(document.getElementsByTagName('toolbarbutton'), function(e) e)) {
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
				if (e.localName == 'menuseparator') {
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
			addEventListener("unload", function() Dialog.unload(), false);
			addEventListener("close", function(evt) Dialog.onclose(evt), false);

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
					let isPrivate = event.dataTransfer.mozSourceNode
						&& PrivateBrowsing.isWindowPrivate(event.dataTransfer.mozSourceNode.ownerDocument.defaultView);
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

			$('tooldonate').addEventListener('click', function(evt) { if (evt.button == 0) Dialog.openDonate() }, false);
		})();

		this.paneSchedule = $("schedule");
		this.paneSchedule.addEventListener("command", function() {
			showPreferences("paneSchedule");
		}, false);

		let tree = $("downloads");
		Tree.init(tree);
		addEventListener("unload", function() {
			removeEventListener("unload", arguments.callee, false);
			Tree.unlink();
		}, false);
		tree.addEventListener("change", function() {
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
							let db = de.boxObject
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
		$('listSpeedsSpinners').addEventListener('up', function() Dialog.changeSpeedLimitUp(), false);
		$('listSpeedsSpinners').addEventListener('down', function() Dialog.changeSpeedLimitDown(), false);

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
				for (nagnext = isFinite(nagnext) && nagnext > 0 ? nagnext : 100; seq >= nagnext; nagnext *= 2);

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
					)
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
					callback: function() showPreferences("panePrivacy")
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
		if (idx % 250 == 0) {
			GlobalProgress.value = idx;
		}
		if (idx % 500 == 0) {
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
			d._pathName = Dialog_loadDownloads_get(down, "pathName");
			d._description = Dialog_loadDownloads_get(down, "description");
			d._title = Dialog_loadDownloads_get(down, "title");
			d._mask = Dialog_loadDownloads_get(down, "mask");
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

			if (down.hashCollection) {
				d.hashCollection = DTA.HashCollection.load(down.hashCollection);
			}
			else if (down.hash) {
				d.hashCollection = new DTA.HashCollection(new DTA.Hash(down.hash, down.hashType));
			}
			if ('maxChunks' in down) {
				d._maxChunks = down.maxChunks;
			}

			d.started = d.partialSize != 0;
			switch (d.state) {
				case PAUSED:
				case QUEUED:
				{
					for (let i = 0, c; i < down.chunks.length; ++i) {
						c = down.chunks[i];
						d.chunks.push(new Chunk(d, c.start, c.end, c.written));
					}
					d.refreshPartialSize();
					if (d.state == PAUSED) {
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

			d.position = Tree.fastLoad(d);
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
			Version.OS == 'darwin' ? 'chrome,modal,dependent=yes' : 'chrome,centerscreen,dialog=no,dependent=yes'
		);
	},

	openDonate: function() {
		try {
			openUrl('http://www.downthemall.net/howto/donate/');
		}
		catch(ex) {
			alert(ex);
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
			if (d.state == FINISHING) {
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
			if (download.state != COMPLETE) {
				download[method]();
			}
			return true;
		});
		try {
			log(LOG_INFO, "reinit initiated");
			defer(function() this.shutdown(this._continueReinit), this);
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
		if (topic == 'quit-application-requested') {
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
		else if (topic == "DTA:upgrade") {
			Preferences.setExt("rebootOnce", true);
			if (!this._canClose()) {
				delete this._forceClose;
				try {
					let cancelQuit = subject.QueryInterface(Ci.nsISupportsPRBool);
					cancelQuit.data = true;
					this._mustReload = true;
					for (let d of Tree.all) {
						if (d.state == RUNNING && d.canResumeLater) {
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
		else if (topic == 'quit-application-granted') {
			this._forceClose = true;
			delete this._mustReload;
		}
		else if (topic == 'network:offline-status-changed') {
			this.offline = data == "offline";
		}
		else if (topic == 'DTA:filterschanged') {
			Tree.assembleMenus();
		}
		else if (topic == 'DTA:clearedQueueStore') {
			this.reinit(true);
		}
		else if (topic == 'DTA:shutdownQueueStore') {
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
				if (advanced != 0 && d.totalSize > 0) {
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
			speed = Utils.formatSpeed(this._speeds.avg);
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
			this.statusText.label = _("currentdownloadstats", [this.completed, Tree.downloadCount, Tree.rowCount, this._running.length]);
			if (!this._running.length) {
				this.statusSpeed.hidden = true;
			}
			else {
				this.statusSpeed.hidden = false;
				this.statusSpeed.label = speed;
			}

			// Refresh window title
			if (this._running.length == 1 && this._running[0].totalSize > 0) {
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
						if (dstate == CANCELED) {
							state = CANCELED;
							break;
						}
						if (dstate == PAUSED) {
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
		if (this.offline == de.hasAttribute('offline')) {
			return;
		}

		if (this.offline) {
			de.setAttribute('offline', true);
			$('netstatus').setAttribute('offline', true);
			for (let d of Tree.all) {
				if (d.state == RUNNING) {
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
				if (!d) {
					continue;
				}
				// checks for timeout
				if (d.state == RUNNING && (ts - d.timeLastProgress) >= Prefs.timeout * 1000) {
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
					filterInSitu(this._autoRetrying, function(d) !d.autoRetry());
				}
				this.startNext();
			}
		}
		catch(ex) {
			log(LOG_ERROR, "process():", ex);
		}
	},
	processAutoClears: (function() {
		function _m(e) e.get();
		function _f(e) !!e;
		return function() {
			if (Prefs.autoClearComplete && this._autoClears.length && mapFilterInSitu(this._autoClears, _m, _f).length) {
				Tree.remove(this._autoClears);
				this._autoClears.length = 0;
			}
		};
	})(),
	checkSameName: function(download, path) {
		for (let runner of this._running) {
			if (runner == download) {
				continue;
			}
			if (runner.destinationFile == path) {
				return true;
			}
		}
		return false;
	},
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
			while (this._running.length < Prefs.maxInProgress) {
				let d = this.scheduler.next(this._running);
				if (!d) {
					break;
				}
				if (d.state != QUEUED) {
					log(LOG_ERROR, "FIXME: scheduler returned unqueued download");
					continue;
				}
				this.run(d);
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
			return;
		}
		download.forced = !!forced;
		download.status = TextCache_STARTING;
		if (download.state == FINISHING || (download.partialSize >= download.totalSize && download.totalSize)) {
			// we might encounter renaming issues;
			// but we cannot handle it because we don't know at which stage we crashed
			download.setState(FINISHING);
			download.partialSize = download.totalSize;
			log(LOG_INFO, "Download seems to be complete; likely a left-over from a crash, finish it:" + download);
			download.finishDownload();
			return;
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
		if (!this._running.length) {
			this._speeds.clear(); // started to run; remove old global speed stats
		}
		this._running.push(download);
		download.prealloc(download.maybeResumeDownload.bind(download));
		download.resumeDownload();
	},
	wasStopped: function(download) {
		let idx = this._running.indexOf(download);
		if (idx > -1) {
			this._running.splice(idx, 1);
		}
	},
	resetScheduler: function() {
		if (!Dialog.scheduler) {
			return;
		}
		Dialog.scheduler.destroy();
		Dialog.scheduler = null;
	},
	_signal_some: function(d) d.isOf(FINISHING | RUNNING | QUEUED),
	signal: function(download) {
		download.save();
		const state = download.state;
		if (state == QUEUED) {
			Dialog.resetScheduler();
			return;
		}
		if (state == RUNNING) {
			this._wasRunning = true;
		}
		else if (Prefs.autoClearComplete && state == COMPLETE) {
			this._autoClears.push(weak(download));
		}
		if (!this._initialized || !this._wasRunning || state != COMPLETE) {
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
			log(LOG_DEBUG, "signal(): Queue finished");
			Utils.playSound("done");

			let dp = Tree.at(0);
			if (dp) {
				dp = dp.destinationPath;
			}
			if (Prefs.alertingSystem == 1) {
				AlertService.show(_("suc.title"), _('suc'), function() Utils.launch(dp));
			}
			else if (dp && Prefs.alertingSystem == 0) {
				if (Prompts.confirmYN(window, _('suc'),  _("openfolder")) == 0) {
					try {
						Utils.launch(dp);
					}
					catch (ex){
						// no-op
					}
				}
			}
			if (Prefs.autoClose) {
				Dialog.close();
			}
		}
		catch(ex) {
			log(LOG_ERROR, "signal():", ex);
		}
	},
	markAutoRetry: function(download) {
		if (this._autoRetrying.indexOf(download) == -1) {
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
		if (Tree.some(function(d) { return d.started && !d.canResumeLater && d.state == RUNNING; })) {
			var rv = Prompts.confirmYN(
				window,
				_("confclose"),
				_("nonresclose")
			);
			if (rv) {
				return false;
			}
		}
		if (Tree.some(function(d) d.isPrivate && d.state != COMPLETE)) {
			var rv = Prompts.confirmYN(
				window,
				_("confclose"),
				_("privateclose")
			);
			if (rv) {
				return false;
			}
		}

		return (this._forceClose = true);
	},
	close: function() this.shutdown(this._doneClosing),
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
				else if (d.state == FINISHING) {
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
				Timers.createOneshot(250, function() this.shutdown(callback), this);
				return false;
			}
			log(LOG_ERROR, "Going down even if queue was not probably closed yet!");
		}
		callback.call(this);
		this._initialized = false;
		return true;
	},
	_cleanTmpDir: function() {
		if (!Prefs.tempLocation || Preferences.getExt("tempLocation", '') != '') {
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
		for (let f in new Utils.SimpleIterator(tmpEnum, Ci.nsIFile)) {
			if (f.leafName.match(/\.dtapart$/) && known.indexOf(f.leafName) == -1) {
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
		FileExts = null;
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
		this.resetScheduler();
		Dialog = null;
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
})

const Metalinker = {
	handleDownload: function(download) {
		download.setState(CANCELED);
		Tree.remove(download, false);
		let file = download.destinationLocalFile;

		this.handleFile(file, download.referrer, function() {
			try {
				file.remove(false);
			}
			catch (ex) {
				log(LOG_ERROR, "failed to remove metalink file!", ex);
			}
		}, download.isPrivate);
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
			catch (ex) {
				log(LOG_ERROR, "Metalinker::handleDownload", ex);
				if (!(ex instanceof Error)) {
					ex = new Error(_('mlerror', [ex.message ? ex.message : (ex.error ? ex.error : ex.toString())]));
				}
				if (ex instanceof Error) {
					AlertService.show(_('mlerrortitle'), ex.message);
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
		if (this.state == nv) {
			return nv;
		}
		if (this.state == RUNNING) {
			// remove ourself from inprogresslist
			Dialog.wasStopped(this);
			// kill the bucket via it's setter
			this.bucket = null;
		}
		this.speed = '';
		this._setStateInternal(nv);
		if (this.state == RUNNING) {
			// set up the bucket
			this._bucket = new ByteBucket(this.speedLimit, 1.7);
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
		if (this._speedLimit == nv) {
			return;
		}
		this._speedLimit = nv;
		if (this.state == RUNNING) {
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
		if (this._fileName == nv || this.fileNameFromUser) {
			return nv;
		}
		log(LOG_ERROR, "fn is " + this._fileName + " nv: " + nv);
		this._fileName = nv;
		delete this._fileNameAndExtension;
		this.rebuildDestination();
		this.invalidate(0);
		return nv;
	},
	get fileNameAndExtension() {
		if (!this._fileNameAndExtension) {
			let name = this.fileName;
			let ext = Utils.getExtension(name);
			if (ext) {
				name = name.substring(0, name.length - ext.length - 1);

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
				name = this.fileName;
				ext = '';
			}

			this._fileNameAndExtension = {name: name, extension: ext };
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
			let name = Utils.getUsableFileName(this.referrerUrlManager.usable);
			let ext = Utils.getExtension(name);
			if (ext) {
				name = name.substring(0, name.length - ext.length - 1);
			}
			else {
				ext = '';
			}
			this._referrerFileNameAndExtension = {name: name, extension: ext};
		}
		return this._referrerFileNameAndExtension;
	},
	_description: null,
	get description() {
		return this._description;
	},
	set description(nv) {
		if (nv == this._description) {
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
		if (nv == this._title) {
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
		if (this._pathName == nv) {
			return nv;
		}
		this._pathName = nv;
		this.rebuildDestination();
		this.invalidate(0);
		return nv;
	},

	_mask: null,
	get mask() {
		return this._mask;
	},
	set mask(nv) {
		if (this._mask == nv) {
			return nv;
		}
		this._mask = Utils.removeFinalSlash(Utils.removeLeadingSlash(Utils.normalizeSlashes(nv)));
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
		if (this.destinationNameOverride == nv) {
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
		if (this._conflicts == nv) {
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
			var dest = Prefs.tempLocation
				? Prefs.tempLocation.clone()
				: new Instances.LocalFile(this.destinationPath);
			let name = this.fileName;
			if (name.length > 60) {
				name = name.substring(0, 60);
			}
			dest.append(name + "-" + Utils.newUUIDString() + '.dtapart');
			this._tmpFile = dest;
		}
		return this._tmpFile;
	},
	_hashCollection: null,
	get hashCollection() {
		return this._hashCollection;
	},
	set hashCollection(nv) {
		if (nv != null && !(nv instanceof DTA.HashCollection)) {
			throw new Exception("Not a hash collection");
		}
		this._hashCollection = nv;
		this._prettyHash = this._hashCollection
			? _('prettyhash', [this._hashCollection.full.type, this._hashCollection.full.sum])
			: TextCache_NAS;
	},
	_prettyHash: null,
	get prettyHash() {
		return this._prettyHash;
	},

	is: function(state) this.state == state,
	isOf: function(states) (this.state & states) != 0,
	save: function() {
		if (this.deleting) {
			return false;
		}
		const state = this.state;
		if (
			(Prefs.removeCompleted && state == COMPLETE)
			|| (Prefs.removeCanceled && state == CANCELED)
			|| (Prefs.removeAborted && state == PAUSED)
		) {
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
	get contentType() this._contentType,
	set contentType(nv) {
		if (nv == this._contentType) {
			return;
		}
		this._contentType = nv;
		delete this._fileNameAndExtension;
	},
	visitors: null,
	_totalSize: 0,
	get totalSize() { return this._totalSize; },
	set totalSize(nv) {
		if (nv >= 0 && !isNaN(nv)) {
			this._totalSize = Math.floor(nv);
		}
		this.invalidate(3);
		this.prealloc(this.maybeResumeDownload.bind(this));
	},
	partialSize: 0,
	progress: 0,
	mustGetInfo: false,

	get startDate() this._startDate || (this.startDate = new Date()),
	set startDate(nv) this._startDate = nv,

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
		else if (this._maxChunks > this._activeChunks && this.state == RUNNING) {
			this.resumeDownload();

		}
		this.invalidate(6);
		log(LOG_DEBUG, "mc set to " + nv);
		return this._maxChunks;
	},
	timeLastProgress: 0,
	timeStart: 0,

	_icon: null,
	get iconAtom() {
		if (!this._icon) {
			this._icon = FileExts.getAtom(this.destinationName, 'metalink' in this);
		}
		return this._icon;
	},
	get iconProp() {
		if (!this._icon) {
			this._icon = (this.isPrivate ? "iconic private " : "iconic ") + FileExts.getAtom(this.destinationName, 'metalink' in this).toString();
		}
		return this._icon;
	},
	get largeIcon() {
		return getLargeIcon(this.destinationName, 'metalink' in this);
	},
	get size() {
		try {
			let file = null;
			if (!this.isOf(COMPLETE | FINISHING)) {
				file = this._tmpFile || null;
			}
			else {
				file = this.destinationLocalFile;
			}
			if (file && file.exists()) {
				return file.fileSize;
			}
		}
		catch (ex) {
			log(LOG_ERROR, "download::getSize(): ", ex);
		}
		return 0;
	},
	get dimensionString() {
		if (this.partialSize <= 0) {
			return TextCache_UNKNOWN;
		}
		else if (this.totalSize <= 0) {
			return _('transfered', [Utils.formatBytes(this.partialSize), TextCache_NAS]);
		}
		else if (this.state == COMPLETE) {
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
		if (nv != this._status) {
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
		if (!this.totalSize && state == RUNNING) {
			return TextCache_NAS;
		}
		else if (!this.totalSize) {
			return "0%";
		}
		else if (state == COMPLETE) {
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

	moveCompleted: function() {
		if (this.state == CANCELED) {
			return;
		}
		ConflictManager.resolve(this, 'continueMoveCompleted');
	},
	continueMoveCompleted: function() {
		if (this.state == CANCELED) {
			return;
		}
		try {
			// safeguard against some failed chunks.
			for (let c of this.chunks) {
				c.close();
			}
			var destination = new Instances.LocalFile(this.destinationPath);
			log(LOG_INFO, this.fileName + ": Move " + this.tmpFile.path + " to " + this.destinationFile);

			if (!destination.exists()) {
				destination.create(Ci.nsIFile.DIRECTORY_TYPE, Prefs.dirPermissions);
			}
			var df = destination.clone();
			df.append(this.destinationName);
			if (df.exists()) {
				df.remove(false);
			}
			// move file
			if (this.compression) {
				this.setState(FINISHING);
				this.status = TextCache_DECOMPRESSING;
				new Decompressor(this);
			}
			else {
				this.status = TextCache_MOVING;
				function move(self, x) {
					asyncMoveFile(self.tmpFile, destination, Prefs.permissions, function (ex) {
						try {
							if (ex) {
								throw new Exception(ex);
							}
						}
						catch (ex) {
							x = x || 1;
							if (x > 5) {
								self.complete(ex);
								return;
							}
							setTimeoutOnlyFun(function() move(self, ++x), x * 250);
							return;
						}
						self.complete();
					});
				}
				destination.append(this.destinationName);
				move(this);
			}
		}
		catch(ex) {
			log(LOG_ERROR, "continueMoveCompleted encountered an error", ex);
			this.complete(ex);
		}
	},
	handleMetalink: function() {
		try {
			Metalinker.handleDownload(this);
		}
		catch (ex) {
			log(LOG_ERROR, "handleMetalink", ex);
		}
	},
	_verificator: null,
	verifyHash: function() {
		this.setState(FINISHING);
		this.status = TextCache_VERIFYING;
		let tp = this;
		this._verificator = Verificator.verify(
			this.tmpFile.exists() ? this.tmpFile.path : this.destinationFile,
			this.hashCollection,
			function(mismatches) {
				delete tp._verificator;
				tp._verificator = null;

				if (!mismatches) {
					log(LOG_ERROR, "hash not computed");
					Prompts.alert(window, _('error', ["Metalink"]), _('verificationfailed', [tp.destinationFile]));
					tp.complete();
				}
				else if (mismatches.length) {
					log(LOG_ERROR, "Mismatches: " + mismatches.toSource());
					tp.verifyHashError(mismatches);
				}
				else {
					tp.complete();
				}
			},
			function(progress) {
				tp.partialSize = progress;
				tp.invalidate();
			}
		);
	},
	verifyHashError: function(mismatches) {
		let file = this.destinationLocalFile;
		filterInSitu(mismatches, function(e) e.start != e.end);

		function deleteFile() {
			try {
				if (file.exists()) {
					file.remove(false);
				}
			}
			catch (ex) {
				log(LOG_ERROR, "Failed to remove file after checksum mismatch", ex);
			}
		}

		function recoverPartials(download) {
			// merge
			for (let i = mismatches.length - 1; i > 0; --i) {
				if (mismatches[i].start == mismatches[i-1].end + 1) {
					mismatches[i-1].end = mismatches[i].end;
					mismatches.splice(i, 1);
				}
			}
			let chunks = [];
			let next = 0;
			for (let mismatch of mismatches) {
				if (next != mismatch.start) {
					chunks.push(new Chunk(download, next, mismatch.start - 1, mismatch.start - next));
				}
				chunks.push(new Chunk(download, mismatch.start, mismatch.end));
				next = mismatch.end + 1;
			}
			if (next != download.totalSize) {
				log(LOG_DEBUG, "Inserting last");
				chunks.push(new Chunk(download, next, download.totalSize - 1, download.totalSize - next));
			}
			download.chunks = chunks;
			download.refreshPartialSize();
			download.queue();
		}

		if (mismatches.length && this.tmpFile.exists()) {
			// partials
			let act = Prompts.confirm(window, _('verifyerror.title'), _('verifyerror.partialstext'), _('recover'), _('delete'), _('keep'));
			switch (act) {
				case 0: deleteFile(); recoverPartials(this, mismatches); return;
				case 1: deleteFile(); this.cancel(); return;
			}
			this.complete();
		}
		else {
			let act = Prompts.confirm(window, _('verifyerror.title'), _('verifyerror.text'), _('retry'), _('delete'), _('keep'));
			switch (act) {
				case 0: deleteFile(); this.safeRetry(); return;
				case 1: deleteFile(); this.cancel(); return;
			}
			this.complete();
		}
	},
	cancelVerification: function() {
		if (!this._verificator) {
			return;
		}
		this._verificator.cancel();
	},
	customFinishEvent: function() {
		new CustomEvent(this, Prefs.finishEvent);
	},
	setAttributes: function() {
		if (Prefs.setTime) {
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
		this.totalSize = this.partialSize = this.size;
		++Dialog.completed;

		this.complete();
	},
	finishDownload: function(exception) {
		if (!this.chunksReady(this.finishDownload.bind(this, exception))) {
			return;
		}
		log(LOG_DEBUG, "finishDownload, connections: " + this.sessionConnections);
		this._completeEvents = ['moveCompleted', 'setAttributes'];
		if (this.hashCollection) {
			if (this.hashCollection.hasPartials) {
				// need to verify first
				this._completeEvents.unshift('verifyHash');
			}
			else {
				this._completeEvents.push('verifyHash');
			}
		}
		if ('isMetalink' in this) {
			this._completeEvents.push('handleMetalink');
		}
		if (Prefs.finishEvent) {
			this._completeEvents.push('customFinishEvent');
		}
		this.complete();
	},
	_completeEvents: [],
	complete: function(exception) {
		this.chunks.length = 0;
		this.speeds.clear();
		if (exception) {
			this.fail(_("accesserror"), _("accesserror.long"), _("accesserror"));
			log(LOG_ERROR, "complete: ", exception);
			return;
		}
		if (this._completeEvents.length) {
			var evt = this._completeEvents.shift();
			var tp = this;
			defer(function() {
				try {
					tp[evt]();
				}
				catch(ex) {
					log(LOG_ERROR, "completeEvent failed: " + evt, ex);
					tp.complete();
				}
			});
			return;
		}
		this.activeChunks = 0;
		this.setState(COMPLETE);
		this.status = TextCache_COMPLETE;
		this.visitors = new VisitorManager();
		this.compression = null;
	},
	get maskURL() this.urlManager.usableURL,
	get maskCURL() Utils.getCURL(this.maskURL),
	get maskURLPath() this.urlManager.usableURLPath,
	get maskReferrerURL() this.referrerUrlManager.usableURL,
	get maskReferrerURLPath() this.referrerUrlManager.usableURLPath,
	get maskReferrerCURL() Utils.getCURL(this.maskReferrerURL),
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
			let parent = file.parent;
			this._destinationPath = parent.path;
			this._destinationNameFull = Utils.formatConflictName(
					this.destinationNameOverride ? this.destinationNameOverride : this._destinationName,
					this.conflicts
				);
			parent.append(this.destinationName);
			this._destinationFile = parent.path;
			this._destinationLocalFile = parent;
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
		ConflictManager.resolve(this);
	},
	checkSpace: function(required) {
		try {
			let tmp = Prefs.tempLocation, vtmp = 0;
			if (tmp) {
				vtmp = Utils.validateDir(tmp);
				if (!vtmp && Utils.getFreeDisk(vtmp) < required) {
					this.fail(_("freespace.title"), _("freespace.temp"), _("freespace"));
					return false;
				}
			}
			let realDest = Utils.validateDir(this.destinationPath);
			if (!realDest) {
				throw new Error("invalid destination folder");
			}
			let nsd = Utils.getFreeDisk(realDest);
			// Same save path or same disk (we assume that tmp.avail ==
			// dst.avail means same disk)
			// simply moving should succeed
			if (this.compression && (!tmp || Utils.getFreeDisk(vtmp) == required)) {
				// we cannot know how much space we will consume after
				// decompressing.
				// so we assume factor 1.0 for the compressed and factor 1.5 for
				// the decompressed file.
				required *= 2.5;
			}
			if (nsd < required) {
				log(LOG_DEBUG, "nsd: " +  nsd + ", tsd: " + required);
				this.fail(_("freespace.title"), _("freespace.dir"), _("freespace"));
				return false;
			}
			return true;
		}
		catch (ex) {
			log(LOG_ERROR, "size check threw", ex);
			this.fail(_("accesserror"), _("accesserror.long"), _("accesserror"));
		}
		return false;
	},

	fail: function(title, msg, state) {
		log(LOG_INFO, "failDownload invoked");

		this.cancel(state);

		Utils.playSound("error");

		switch (Prefs.alertingSystem) {
			case 1:
				AlertService.show(title, msg);
				break;
			case 0:
				alert(msg);
				break;
		}
	},

	_openChunks: 0,
	chunkOpened: function() {
		this._openChunks++;
		log(LOG_DEBUG, "chunkOpened: " + this._openChunks);
	},
	chunkClosed: function() {
		this._openChunks--;
		log(LOG_DEBUG, "chunkClosed: " + this._openChunks);
		this.refreshPartialSize();
		this.invalidate();
		if (!this._openChunks && this._chunksReady_next) {
			log(LOG_DEBUG, "Running chunksReady_next");
			let fn = this._chunksReady_next;
			delete this._chunksReady_next;
			fn();
		}
		if (!this._openChunks) {
			this.save();
		}
	},
	chunksReady: function(nextEvent) {
		if (!this._openChunks) {
			return true;
		}
		this._chunksReady_next = nextEvent;
		log(LOG_DEBUG, "chunksReady: reschedule");
		return false;
	},

	cancel: function(message) {
		try {
			const state = this.state;
			if (state == COMPLETE) {
				Dialog.completed--;
			}
			else if (state == RUNNING) {
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
			let bound = this.cancel.bind(this, message);
			if (!this.chunksReady(bound)) {
				return;
			}
			if (!this.cancelPreallocation(bound)) {
				return;
			}
			log(LOG_INFO, this.fileName + ": canceled");

			this.shutdown();

			this.removeTmpFile();

			// gc
			if (this.deleting) {
				return;
			}
			if (message == "" || !message) {
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
		catch(ex) {
			log(LOG_ERROR, "cancel():", ex);
		}
	},

	cleanup: function() {
		delete this.visitors;
		delete this.chunks;
		delete this.speeds;
		delete this.urlManager;
		delete this.referrer;
		delete this._referrerUrlManager;
		delete this._destinationLocalFile;
		delete this._tmpFile;
		delete this.rebuildDestination_renamer;
	},

	_registerPreallocCallback: function(callback) {
		if (!callback) {
			return;
		}
		try {
			this._notifyPreallocation.push(callback);
		}
		catch (ex) {
			this._notifyPreallocation = [callback];
		}
	},
	createDirectory: function(file) {
		if (file.parent.exists()) {
			return;
		}
		file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, Prefs.dirPermissions);
	},
	prealloc: function(callback) {
		let file = this.tmpFile;

		if (this.state != RUNNING) {
			return false;
		}

		if (!this.totalSize) {
			log(LOG_DEBUG, "pa: no totalsize");
			return false;
		}
		if (this.preallocating) {
			log(LOG_DEBUG, "pa: already working");
			return true;
		}

		if (!file.exists() || this.totalSize != this.size) {
			this.createDirectory(file);
			let pa = Preallocator.prealloc(
				file,
				this.totalSize,
				Prefs.permissions,
				Prefs.sparseFiles,
				this._donePrealloc.bind(this)
				);
			if (pa) {
				this.preallocating = true;
				this._preallocator = pa;
				this._registerPreallocCallback(callback);
				log(LOG_INFO, "pa: started");
			}
		}
		else {
			log(LOG_INFO, "pa: already allocated");
		}
		return this.preallocating;
	},
	cancelPreallocation: function(callback) {
		if (this._preallocator) {
			log(LOG_INFO, "pa: going to cancel");
			try {
				this._notifyPreallocationCancelled.push(callback);
			}
			catch (ex) {
				this._notifyPreallocationCancelled = [callback];
			}
			this._registerPreallocCallback(callback);
			this._preallocator.cancel();
			return false;
		}
		return true;
	},

	_donePrealloc: function(res) {
		log(LOG_INFO, "pa: done");
		delete this._preallocator;
		this.preallocating = false;

		if (this._notifyPreallocation) {
			for (let c of this._notifyPreallocation) {
				try {
					c();
				}
				catch (ex) {
					log(LOG_ERROR, "pa: callback threw", ex);
				}
			}
			delete this._notifyPreallocation;
		}
	},

	shutdown: function() {
		this.cancelPreallocation();
		this.cancelVerification();
	},

	removeTmpFile: function() {
		if (!!this._tmpFile && this._tmpFile.exists()) {
			try {
				this._tmpFile.remove(false);
			}
			catch (ex) {
				log(LOG_ERROR, "failed to remove tmpfile: " + this.tmpFile.path, ex);
			}
		}
		this._tmpFile = null;
	},

	sessionConnections: 0,
	_autoRetries: 0,
	_autoRetryTime: 0,
	get autoRetrying() {
		return !!this._autoRetryTime;
	},
	pauseAndRetry: function() {
		this.pause();
		this.resumable = true;
		this.save();

		if (Prefs.autoRetryInterval && !(Prefs.maxAutoRetries && Prefs.maxAutoRetries <= this._autoRetries)) {
			Dialog.markAutoRetry(this);
			this._autoRetryTime = Utils.getTimestamp();
			log(LOG_INFO, "marked auto-retry: " + this);
		}
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
		if (this.state != RUNNING) {
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
			download.createDirectory(download.tmpFile);
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
			if (this.chunks.length == 0) {
				downloadNewChunk(this, 0, 0, true);
				this.sessionConnections = 0;
				return false;
			}


			// start some new chunks
			let paused = this.chunks.filter(function (chunk) !(chunk.running || chunk.complete));

			while (this.activeChunks < this.maxChunks) {
				if (this.preallocating && this.activeChunks) {
					log(LOG_DEBUG, "not resuming download " + this + " because preallocating");
					return true;
				}

				// restart paused chunks
				if (paused.length) {
					downloadChunk(this, paused.shift());
					rv = true;
					continue;
				}

				if (this.chunks.length == 1 && !!Prefs.loadEndFirst && this.chunks[0].remainder > 3 * Prefs.loadEndFirst) {
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
		if (restart && this.resumable && this.state == RUNNING && this.maxChunks > 2) {
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
		return;
		let scoreboard = '';
		let len = this.totalSize.toString().length;
		for (let [i,c] in Iterator(this.chunks)) {
			scoreboard += i + ": " + c + "\n";
		}
		log(LOG_DEBUG, "scoreboard\n" + scoreboard);
	},
	toString: function() this.urlManager.usable,
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
		if (this.autoRetrying || this.state == RUNNING) {
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

		if (!this.resumable && this.state != COMPLETE) {
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
}
XPCOMUtils.defineLazyGetter(QueueItem.prototype, 'AuthPrompts', function() {
	const {LoggedPrompter} = require("support/loggedPrompter");
	return new LoggedPrompter(window);
});

var ConflictManager = {
	_items: [],
	resolve: function(download, reentry) {
		for (let item of this._items) {
			if (item.download == download) {
				log(LOG_DEBUG, "conflict resolution updated to: " + reentry);
				item.reentry = reentry;
				return;
			}
		}
		if (!this._check(download)) {
			if (reentry) {
				download[reentry]();
			}
			return;
		}
		log(LOG_DEBUG, "conflict resolution queued to: " + reentry);
		this._items.push({download: download, reentry: reentry});
		this._process();
	},
	_check: function(download) {
		let dest = download.destinationLocalFile;
		let sn = false;
		if (download.state == RUNNING) {
			sn = Dialog.checkSameName(download, download.destinationFile);
		}
		return dest.exists() || sn;
	},
	_process: function() {
		if (this._processing) {
			return;
		}
		let cur;
		while (this._items.length) {
			cur = this._items[0];
			if (!this._check(cur.download)) {
				if (cur.reentry) {
					cur.download[cur.reentry]();
				}
				this._items.shift();
				continue;
			}
			break;
		}
		if (!this._items.length) {
			return;
		}

		if (Prefs.conflictResolution != 3) {
			this._return(Prefs.conflictResolution);
			return;
		}
		if ('_sessionSetting' in this) {
			this._return(this._sessionSetting);
			return;
		}
		if (cur.download.shouldOverwrite) {
			this._return(1);
			return;
		}

		this._computeConflicts(cur);

		var options = {
			url: Utils.cropCenter(cur.download.urlManager.usable, 45),
			fn: Utils.cropCenter(cur.download.destinationName, 45),
			newDest: Utils.cropCenter(cur.newDest, 45)
		};

		this._processing = true;

		window.openDialog(
			"chrome://dta/content/dta/manager/conflicts.xul",
			"_blank",
			"chrome,centerscreen,resizable=no,dialog,close=no,dependent",
			options, this
		);
	},
	_computeConflicts: function(cur) {
		let download = cur.download;
		download.conflicts = 0;
		let basename = download.destinationName;
		let newDest = download.destinationLocalFile.clone();
		let i = 1;
		for (;; ++i) {
			newDest.leafName = Utils.formatConflictName(basename, i);
			if (!newDest.exists() && (download.state != RUNNING || !Dialog.checkSameName(this, newDest.path))) {
				break;
			}
		}
		cur.newDest = newDest.leafName;
		cur.conflicts = i;
	},
	_returnFromDialog: function(option, type) {
		if (type == 1) {
			this._sessionSetting = option;
		}
		if (type == 2) {
			Preferences.setExt('conflictresolution', option);
		}
		this._return(option);
	},
	_return: function(option) {
		let cur = this._items[0];
		switch (option) {
			/* rename */    case 0: this._computeConflicts(cur); cur.download.conflicts = cur.conflicts; break;
			/* overwrite */ case 1: cur.download.shouldOverwrite = true; break;
			/* skip */      default: cur.download.cancel(_('skipped')); break;
		}
		if (cur.reentry) {
			cur.download[cur.reentry]();
		}
		this._items.shift();
		this._processing = false;
		this._process();
	}
};


function CustomEvent(download, command) {
	try {
		// may I introduce you to a real bastard way of commandline parsing?! :p
		var uuids = {};
		function callback(u) {
			u = u.substr(1, u.length - 2);
			id = Utils.newUUIDString();
			uuids[id] = u;
			return id;
		}
		function mapper(arg, i) {
			if (arg == "%f") {
				if (i == 0) {
					throw new Error("Will not execute the file itself");
				}
				arg = download.destinationFile;
			}
			else if (arg in uuids) {
				arg = uuids[arg];
			}
			return arg;
		}
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
		alert("failed to execute custom event", ex);
	}
	download.complete();
}

const startDownloads = (function() {
	const series = {};
	lazy(series, "num", function() {
		let rv = DTA.currentSeries();
		DTA.incrementSeries();
		return rv;
	});
	function next(start, downloads, scroll) {
		function addItem(e) {
			try {
				let qi = new QueueItem();
				let lnk = e.url;
				if (typeof lnk == 'string') {
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
						qi.referrer = toURL(e.referrer);
					}
					catch (ex) {
						// We might have been fed with about:blank or other crap. so ignore.
					}
				}
				// only access the setter of the last so that we don't generate stuff trice.
				qi._pathName = Utils.addFinalSlash(e.dirSave).toString();
				qi._description = !!e.description ? e.description : '';
				qi._title = !!e.title ? e.title : '';
				qi._mask = Utils.removeFinalSlash(Utils.removeLeadingSlash(Utils.normalizeSlashes(e.mask)));
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

				if (start) {
					qi._setStateInternal(QUEUED);
					qi.status = TextCache_QUEUED;
				}
				else {
					qi._setStateInternal(PAUSED);
					qi.status = TextCache_PAUSED;
				}

				if (!("isPrivate" in e)) {
					log(LOG_INFO, "A queued item has no isPrivate property. Defaulting to false. Please check the code path for proper PBM support!");
				}

				qi.rebuildDestination();
				Tree.add(qi);
				qi.save();
				first = first || qi;
			}
			catch (ex) {
				log(LOG_ERROR, "addItem", ex);
			}

			return true;
		}

		busy = true;

		let iNum = 0;
		let first = null;
		let g = downloads;
		if ('length' in downloads) {
			g = (i for (i of downloads));
		}

		Tree.beginUpdate();
		QueueStore.beginUpdate();
		let ct = new CoThreadListWalker(
			addItem,
			g,
			-1
		).start(function() {
			QueueStore.endUpdate();
			Tree.endUpdate();
			Tree.invalidate();
			ct = null;
			g = null;
			if (scroll) {
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
	}
	let busy = false;
	let queue = [];

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
