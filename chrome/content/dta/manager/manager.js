/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll!
 *
 * The Initial Developers of the Original Code are
 * Nils Maier, Stefano Verna and Federico Parodi
 * Portions created by the Initial Developers are Copyright (C) 2004-2010
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Stefano Verna <stefano.verna@gmail.com>
 *    Federico Parodi <jimmy2k@gmail.com>
 *    Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const {CoThreadListWalker} = require("cothreads");
const Prompts = require("prompts");
const {ByteBucket} = require("support/bytebucket");
const {GlobalBucket} = require("manager/globalbucket");
const {defer} = require("support/defer");
const {memoize} = require("support/memoize");
const PrivateBrowsing = require("support/pbm");
const {TimerManager} = require("support/timers");
const {ContentHandling} = require("support/contenthandling");
const {asyncMoveFile} = require("manager/asyncmovefile");
const GlobalProgress = new (require("manager/globalprogress").GlobalProgress)(window);
const Limits = require("support/serverlimits");
const {QueueStore} = require("manager/queuestore");
const {SpeedStats} = require("manager/speedstats");
const RequestManipulation = require("manager/requestmanipulation");
const {FileExtensionSheet} = require("support/fileextsheet");
const {UrlManager} = require("support/urlmanager");
const {VisitorManager} = require("manager/visitormanager");
const Preallocator = require("manager/preallocator");
const {Chunk} = require("manager/chunk");
const {Connection} = require("manager/connection");

XPCOMUtils.defineLazyGetter(this, "Version", function() require("version"));
XPCOMUtils.defineLazyGetter(this, "AlertService", function() require("support/alertservice"));
XPCOMUtils.defineLazyGetter(this, "Decompressor", function() require("manager/decompressor").Decompressor);
XPCOMUtils.defineLazyGetter(this, "Verificator", function() require("manager/verificator"));
XPCOMUtils.defineLazyGetter(this, "FileExts", function() new FileExtensionSheet(window));

addEventListener("load", function load_textCache() {
	removeEventListener("load", load_textCache, false);
	const texts = ['paused', 'queued', 'complete', 'canceled', 'nas', 'unknown', 'offline', 'timeout', 'starting', 'decompress', 'verify', 'moving'];
	for (let i = 0, text; i < texts.length; ++i) {
		text = texts[i];
		window["TextCache_" + text.toUpperCase()] = _(text);
	}
}, false);

var Timers = new TimerManager();

const getLargeIcon = (function() {
	const _largeIconSize = (Version.OS == "darwin" ? 48 : 32);
	return memoize(function(name, metalink) getIcon(name, metalink, _largeIconSize), 150);
})();

const Dialog_loadDownloads_props = ['contentType', 'conflicts', 'postData', 'destinationName', 'resumable', 'compression', 'fromMetalink', 'speedLimit'];
function Dialog_loadDownloads_get(down, attr, def) (attr in down) ? down[attr] : (def ? def : '');

const Dialog_serialize_props = ['fileName', 'postData', 'description', 'title', 'resumable', 'mask', 'pathName', 'compression', 'contentType', 'conflicts', 'fromMetalink', 'speedLimit'];

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
	init: function D_init() {
		removeEventListener('load', arguments.callee, false);

		Prefs.init();

		this.statusText = $("statusText");
		this.statusSpeed = $("statusSpeed");

		// Set tooltip texts for each tb button lacking one (copy label)
		(function addTooltips() {
			for each (let e in Array.map(document.getElementsByTagName('toolbarbutton'), function(e) e)) {
				if (!e.hasAttribute('tooltiptext')) {
					e.setAttribute('tooltiptext', e.getAttribute('label'));
				}
			}
			$('tbp_' + $('tools').getAttribute('mode')).setAttribute('checked', "true");
		})();


		(function initActions() {
			let tb = $('actions');
			for each (let e in $$('#popup menuitem')) {
				e.className += " " + e.id;
			}
			for each (let e in $$('#popup .action')) {
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
			addEventListener('unload', function() Dialog.unload(), false);
			addEventListener('close', function(evt) Dialog.onclose(evt), false);

			window.DropProcessor = {
				getSupportedFlavours: function() {
					if (!this._flavors) {
						this._flavors = new FlavourSet();
						this._flavors.appendFlavour('text/x-moz-url');
					}
					return this._flavors;
				},
				onDragOver: function() {},
				onDrop: function (evt, dropdata, session) {
					if (!dropdata) {
						return;
					}
					try {
						let url = Services.io.newURI(
							transferUtils.retrieveURLFromData(dropdata.data, dropdata.flavour.contentType),
							null,
							null
							);
						DTA.saveSingleLink(
							window,
							false,
							new DTA.URL(DTA.getLinkPrintMetalink(url) || url)
							);
					}
					catch (ex) {
						log(LOG_ERROR, "Failed to process drop", ex);
					}
				}
			};

			addEventListener('dragover', function(event) nsDragAndDrop.dragOver(event, DropProcessor), true);
			addEventListener('drop', function(event) nsDragAndDrop.drop(event, DropProcessor), true);

			$('tooldonate').addEventListener('click', function(evt) { if (evt.button == 0) Dialog.openDonate() }, false);
		})();

		this.paneSchedule = $("schedule");
		this.paneSchedule.addEventListener("command", function() {
			DTA.showPreferences("paneSchedule");
		}, false);

		let tree = $("downloads");
		Tree.init(tree);
		addEventListener("unload", function() {
			removeEventListener("unload", arguments.callee, false);
			Tree.unlink();
		}, false);
		tree.addEventListener("change", function() {
			log(LOG_DEBUG, "tree change");
			Dialog.scheduler = null;
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
		for (let [,topic] in Iterator(this._observes)) {
			Services.obs.addObserver(this, topic, true);
		}
		const unload_obs = (function() {
			removeEventListener("unload", unload_obs, false);
			for (let [,topic] in Iterator(this._observes)) {
				Services.obs.removeObserver(this, topic);
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
									label: _('nagneveragain'),
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
	_loadDownloads: function D__loadDownloads() {
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
				250,
				this
			);
			let self = this;
			this._loader.start(function() {
				result = null;
				self._loadDownloads_finish();
			});
		}, this);
	},
	_loadDownloads_item: function D__loadDownloads_item(dbItem, idx) {
		if (!idx) {
			GlobalProgress.total = dbItem.count;
		}
		if (idx % 250 == 0) {
			GlobalProgress.value = idx;
		}
		if (idx % 500 == 0) {
			this._loading.label = _('loading', [idx, dbItem.count, Math.floor(idx * 100 / dbItem.count)]);
		}

		try {
			let down = dbItem.item;
			let d = new QueueItem();
			d.dbId = dbItem.id;
			let state = Dialog_loadDownloads_get(down, "state");
			if (state) {
				d._state = state;
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
						d.fail(_("accesserror"), _("permissions") + " " + _("destpath") + ". " + _("checkperm"), _("accesserror"));
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
			switch (d._state) {
				case PAUSED:
				case QUEUED:
				{
					for (let i = 0, c; i < down.chunks.length; ++i) {
						c = down.chunks[i];
						d.chunks.push(new Chunk(d, c.start, c.end, c.written));
					}
					d.refreshPartialSize();
					if (d._state == PAUSED) {
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
	_loadDownloads_finish: function D__loadDownloads_finish() {
		log(LOG_INFO, "Result was processed");
		delete this._loader;
		Tree.invalidate();
		Tree.doFilter();
		Tree.endUpdate();

		if (this._brokenDownloads.length) {
			QueueStore.beginUpdate();
			try {
				for each (let id in this._brokenDownloads) {
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

		this._updTimer = Timers.createRepeating(REFRESH_FREQ, this.checkDownloads, this, true);
		this.refresh();
		this.start();
	},

	enterPrivateBrowsing: function() {
		log(LOG_INFO, "enterPrivateBrowsing");
		this.reinit(false);
	},
	exitPrivateBrowsing: function() {
		log(LOG_INFO, "exitPrivateBrowsing");
		this.reinit(true);
	},
	canEnterPrivateBrowsing: function() {
		if (Tree.some(function(d) { return d.started && !d.resumable && d.is(RUNNING); })) {
			var rv = Prompts.confirmYN(
				window,
				_("confpbm"),
				_("nonrespbm")
			);
			if (rv) {
				return false;
			}
		}
		return (this._forceClose = true);
	},
	canExitPrivateBrowsing: function() {
		if (Tree.some(function(d) { return d.isOf(RUNNING | QUEUED | PAUSED | FINISHING); })) {
			var rv = Prompts.confirmYN(
				window,
				_("confleavepbm"),
				_("nonleavepbm")
			);
			if (rv) {
				return false;
			}
		}
		return (this._forceClose = true);
	},

	openAdd: function D_openAdd() {
		window.openDialog(
			'chrome://dta/content/dta/addurl.xul',
			'_blank',
			Version.OS == 'darwin' ? 'chrome,modal,dependent=yes' : 'chrome,centerscreen,dialog=no,dependent=yes'
		);
	},

	openDonate: function D_openDonate() {
		try {
			openUrl('http://www.downthemall.net/howto/donate/');
		}
		catch(ex) {
			alert(ex);
		}
	},
	openInfo: function D_openInfo(downloads) {
		let w = window.openDialog(
			"chrome://dta/content/dta/manager/info.xul","_blank",
			"chrome, centerscreen, dialog=no",
			downloads,
			this
			);
	},

	start: function D_start() {
		if (this._initialized) {
			return;
		}

		PrivateBrowsing.registerCallbacks(this);

		if ("arguments" in window) {
			startDownloads(window.arguments[0], window.arguments[1]);
		}
		this._initialized = true;
		for each (let d in Tree.all) {
			if (d.is(FINISHING)) {
				this.run(d);
			}
		}
		Timers.createRepeating(200, this.refreshWritten, this, true);
		Timers.createRepeating(10000, this.saveRunning, this);

		$('loadingbox').parentNode.removeChild($('loadingbox'));
	},

	reinit: function(mustClear) {
		if (!this._initialized) {
			log(LOG_DEBUG, "reinit canceled");
		}
		let method = mustClear ? 'cancel' : 'pause';
		Tree.updateAll(function(download) {
			if (!download.is(COMPLETE)) {
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

	observe: function D_observe(subject, topic, data) {
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
					for each (let d in Tree.all) {
						if (d.is(RUNNING) && d.resumable) {
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
	refresh: function D_refresh() {
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
			for each (let e in $('listSpeeds', 'perDownloadSpeedLimitList')) {
				try {
					e.hint = this._maxObservedSpeed;
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
					for each (let d in Tree.all) {
						if (d.is(CANCELED)) {
							state = CANCELED;
							break;
						}
						if (d.is(PAUSED)) {
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
	refreshWritten: function D_refreshWritten() {
		for (let i = 0, e = this._running.length; i < e; ++i) {
			let d = this._running[i];
			if (!d) {
				continue;
			}
			d.refreshPartialSize();
			d.invalidate();
		}
	},
	saveRunning: function D_saveRunning() {
		if (!this._running.length) {
			return;
		}
		for (let i = 0, e = this._running.length; i < e; ++i) {
			this._running[i].save();
		}
	},

	_processOfflineChange: function D__processOfflineChange() {
		let de = $('downloads');
		if (this.offline == de.hasAttribute('offline')) {
			return;
		}

		if (this.offline) {
			de.setAttribute('offline', true);
			$('netstatus').setAttribute('offline', true);
			for each (let d in Tree.all) {
				if (d.is(RUNNING)) {
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

	checkDownloads: function D_checkDownloads() {
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
				if (d.is(RUNNING) && (ts - d.timeLastProgress) >= Prefs.timeout * 1000) {
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

			if (Prefs.autoClearComplete && this._autoClears.length) {
				Tree.remove(this._autoClears);
				this._autoClears = [];
			}

			if (!this.offline && !this._mustReload) {
				if (Prefs.autoRetryInterval) {
					filterInSitu(this._autoRetrying, function(d) !d.autoRetry());
				}
				this.startNext();
			}
		}
		catch(ex) {
			log(LOG_ERROR, "checkDownloads():", ex);
		}
	},
	checkSameName: function D_checkSameName(download, path) {
		for each (let runner in this._running) {
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
	startNext: function D_startNext() {
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
				this.scheduler = Limits.getConnectionScheduler(Tree.all, this._running);
				log(LOG_DEBUG, "rebuild scheduler");
			}
			while (this._running.length < Prefs.maxInProgress) {
				let d = this.scheduler.next(this._running);
				if (!d) {
					break;
				}
				if (!d.is(QUEUED)) {
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
	run: function D_run(download, forced) {
		if (this.offline) {
			return;
		}
		download.forced = !!forced;
		download.status = TextCache_STARTING;
		if (download.is(FINISHING) || (download.partialSize >= download.totalSize && download.totalSize)) {
			// we might encounter renaming issues;
			// but we cannot handle it because we don't know at which stage we crashed
			download.state = FINISHING;
			download.partialSize = download.totalSize;
			log(LOG_INFO, "Download seems to be complete; likely a left-over from a crash, finish it:" + download);
			download.finishDownload();
			return;
		}
		download.timeLastProgress = Utils.getTimestamp();
		download.timeStart = Utils.getTimestamp();
		download.state = RUNNING;
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
	wasStopped: function D_wasStopped(download) {
		let idx = this._running.indexOf(download);
		if (idx > -1) {
			this._running.splice(idx, 1);
		}
	},
	_signal_some: function D_signal_some(d) d.isOf(FINISHING | RUNNING | QUEUED),
	signal: function D_signal(download) {
		download.save();
		if (download.is(QUEUED)) {
			Dialog.scheduler = null;
			return;
		}
		if (download.is(RUNNING)) {
			this._wasRunning = true;
		}
		else if (Prefs.autoClearComplete && download.is(COMPLETE)) {
			this._autoClears.push(download);
		}
		if (!this._initialized || !this._wasRunning || !download.is(COMPLETE)) {
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
				AlertService.show(_("dcom"), _('suc'), function() Utils.launch(dp));
			}
			else if (dp && Prefs.alertingSystem == 0) {
				if (Prompts.confirmYN(window, _('suc'),  _("folder")) == 0) {
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
	markAutoRetry: function D_markAutoRetry(download) {
		if (this._autoRetrying.indexOf(download) == -1) {
			this._autoRetrying.push(download);
		}
	},
	wasRemoved: function D_wasRemoved(download) {
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
	_canClose: function D__canClose() {
		if (Tree.some(function(d) { return d.started && !d.resumable && d.is(RUNNING); })) {
			var rv = Prompts.confirmYN(
				window,
				_("confclose"),
				_("nonresclose")
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
	shutdown: function D_close(callback) {
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
				if (d.isOf(RUNNING | QUEUED)) {
					// enumerate all running chunks
					for (let [,c] in Iterator(d.chunks)) {
						if (c.running) {
							++chunks;
						}
					}
					d.pause();
					d.state = QUEUED;
				}
				else if (d.is(FINISHING)) {
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
		return true;
	},
	_cleanTmpDir: function D__cleanTmpDir() {
		if (!Prefs.tempLocation || Preferences.getExt("tempLocation", '') != '') {
			// cannot perform this action if we don't use a temp file
			// there might be far too many directories containing far too many
			// tmpFiles.
			// or part files from other users.
			return;
		}
		let known = [];
		for each (d in Tree.all) {
			known.push(d.tmpFile.leafName);
		}
		let tmpEnum = Prefs.tempLocation.directoryEntries;
		let unknown = [];
		for (let f in new Utils.SimpleIterator(tmpEnum, Ci.nsILocalFile)) {
			if (f.leafName.match(/\.dtapart$/) && known.indexOf(f.leafName) == -1) {
				unknown.push(f);
			}
		}
		for (let [,f] in Iterator(unknown)) {
			try {
				f.remove(false);
			}
			catch (ex) {}
		}
	},
	_safeCloseAttempts: 0,

	unload: function D_unload() {
		PrivateBrowsing.unregisterCallbacks(this);
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
		for (let [,d] in Iterator(Tree._downloads)) {
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
		Dialog = null;
		return true;
	}
};
addEventListener('load', function() Dialog.init(), false);
unloadWindow(window, function () {
	Dialog._forceClose = true;
	Dialog.close();
})

const Metalinker = {
	handleDownload: function ML_handleDownload(download) {
		download.state = CANCELED;
		Tree.remove(download, false);
		let file = new Instances.LocalFile(download.destinationFile);

		this.handleFile(file, download.referrer, function() {
			try {
				file.remove(false);
			}
			catch (ex) {
				log(LOG_ERROR, "failed to remove metalink file!", ex);
			}
		});
	},
	handleFile: function ML_handleFile(aFile, aReferrer, aCallback) {
		let aURI = Services.io.newFileURI(aFile);
		this.parse(aURI, aReferrer, function (res, ex) {
			try {
				if (ex) {
					throw ex;
				}
				if (!res.downloads.length) {
					throw new Error(_('mlnodownloads'));
				}
				for (let [,e] in Iterator(res.downloads)) {
					if (e.size) {
						e.size = Utils.formatBytes(e.size);
					}
					e.fileName = Utils.getUsableFileName(e.fileName);
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

function Replacer(o) {
	this._obj = o;
}
Replacer.prototype = {
	get name() this._obj.fileNameAndExtension.name,
	get ext() this._obj.fileNameAndExtension.extension,
	get text() Utils.replaceSlashes(this._obj.description, " ").trim(),
	get flattext() Utils.getUsableFileNameWithFlatten(this._obj.description),
	get title() this._obj.title.trim(),
	get flattitle() Utils.getUsableFileNameWithFlatten(this._obj.title),
	get url() this._obj.urlManager.host,
	get domain() this._obj.urlManager.domain,
	get subdirs() this._obj.maskURLPath,
	get flatsubdirs() Utils.getUsableFileNameWithFlatten(this._obj.maskURLPath),
	get refer() this._obj.referrer ? this._obj.referrer.host.toString() : '',
	get qstring() this._obj.maskURL.query || '',
	get curl() this._obj.maskCURL,
	get flatcurl() Utils.getUsableFileNameWithFlatten(this._obj.maskCURL),
	get num() Utils.formatNumber(this._obj.bNum),
	get inum() Utils.formatNumber(this._obj.iNum),
	get hh() Utils.formatNumber(this._obj.startDate.getHours(), 2),
	get mm() Utils.formatNumber(this._obj.startDate.getMinutes(), 2),
	get ss() Utils.formatNumber(this._obj.startDate.getSeconds(), 2),
	get d() Utils.formatNumber(this._obj.startDate.getDate(), 2),
	get m() Utils.formatNumber(this._obj.startDate.getMonth() + 1, 2),
	get y() this._obj.startDate.getFullYear().toString()
};
Replacer.expr = /\*\w+\*/gi;
function createReplacer(o) {
	let replacements = new Replacer(o);
	return function replacer(type) {
		let t = type.substr(1, type.length - 2);
		if (t in replacements) {
			return replacements[t];
		}
		return type;
	}
}

function QueueItem() {
	this.visitors = new VisitorManager();

	this.chunks = [];
	this.speeds = new SpeedStats(SPEED_COUNT);
	this.rebuildDestination_replacer = createReplacer(this);
}

QueueItem.prototype = {
	_state: QUEUED,
	get state() {
		return this._state;
	},
	set state(nv) {
		if (this._state == nv) {
			return nv;
		}
		if (this._state == RUNNING) {
			// remove ourself from inprogresslist
			Dialog.wasStopped(this);
			// kill the bucket via it's setter
			this.bucket = null;
		}
		this.speed = '';
		this._state = nv;
		if (this._state == RUNNING) {
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
		if (this.is(RUNNING)) {
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
	get fileName() {
		return this._fileName;
	},
	set fileName(nv) {
		if (this._fileName == nv) {
			return nv;
		}
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

	/**
	 * Takes one or more state indicators and returns if this download is in state
	 * of any of them
	 */
	is: function QI_is(state) this._state == state,
	isOf: function QI_isOf(states) (this._state & states) != 0,
	save: function QI_save() {
		if (this.deleting) {
			return false;
		}
		if (
			(Prefs.removeCompleted && this.is(COMPLETE))
			|| (Prefs.removeCanceled && this.is(CANCELED))
			|| (Prefs.removeAborted && this.is(PAUSED))
		) {
			if (this.dbId) {
				this.remove();
			}
			return false;
		}
		if (this.dbId) {
			QueueStore.saveDownload(this.dbId, JSON.stringify(this));
			return true;
		}
		this.dbId = QueueStore.addDownload(JSON.stringify(this), this.position);
		return true;
	},
	remove: function QI_remove() {
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
		else if (this._maxChunks > this._activeChunks && this.is(RUNNING)) {
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
				file = new Instances.LocalFile(this.destinationFile);
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
		else if (this.is(COMPLETE)) {
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
		if (!this.totalSize && this.is(RUNNING)) {
			return TextCache_NAS;
		}
		else if (!this.totalSize) {
			return "0%";
		}
		else if (this.is(COMPLETE)) {
			return "100%";
		}
		return this.progress + "%";
	},
	_destinationPath: '',
	get destinationPath() {
		return this._destinationPath;
	},

	invalidate: function QI_invalidate(cell) {
		Tree.invalidate(this, cell);
	},

	safeRetry: function QI_safeRetry() {
		// reset flags
		this.progress = this.totalSize = this.partialSize = 0;
		this.compression = null;
		this.activeChunks = this.maxChunks = 0;
		for (let [,c] in Iterator(this.chunks)) {
			c.cancelChunk();
		}
		this.chunks = [];
		this.speeds.clear();
		this.otherBytes = 0;
		this.visitors = new VisitorManager();
		this.state = QUEUED;
		Dialog.run(this);
	},

	refreshPartialSize: function QI_refreshPartialSize(){
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
			this.progress = Math.floor(size * 100.0 / this._totalSize);
		}
	},

	pause: function QI_pause(){
		this.state = PAUSED;
		if (this.chunks) {
			for (let [,c] in Iterator(this.chunks)) {
				if (c.running) {
					c.pauseChunk();
				}
			}
		}
		this.activeChunks = 0;
		this.speeds.clear();
		this.otherBytes = 0;
	},

	moveCompleted: function QI_moveCompleted() {
		if (this.is(CANCELED)) {
			return;
		}
		ConflictManager.resolve(this, 'continueMoveCompleted');
	},
	continueMoveCompleted: function QI_continueMoveCompleted() {
		if (this.is(CANCELED)) {
			return;
		}
		try {
			// safeguard against some failed chunks.
			for (let [,c] in Iterator(this.chunks)) {
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
				this.state = FINISHING;
				this.status =  TextCache_DECOMPRESS;
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
	handleMetalink: function QI_handleMetaLink() {
		try {
			Metalinker.handleDownload(this);
		}
		catch (ex) {
			log(LOG_ERROR, "handleMetalink", ex);
		}
	},
	_verificator: null,
	verifyHash: function() {
		this.state = FINISHING;
		this.status = TextCache_VERIFY;
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
		let file = new Instances.LocalFile(this.destinationFile);
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
			for each (let mismatch in mismatches) {
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
			let act = Prompts.confirm(window, _('verifyerrortitle'), _('verifyerrorpartialstext'), _('recover'), _('delete'), _('keep'));
			switch (act) {
				case 0: deleteFile(); recoverPartials(this, mismatches); return;
				case 1: deleteFile(); this.cancel(); return;
			}
			this.complete();
		}
		else {
			let act = Prompts.confirm(window, _('verifyerrortitle'), _('verifyerrortext'), _('retry'), _('delete'), _('keep'));
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
					time =  this.visitors.time;
				}
				catch (ex) {
					// no-op
				}
				// small validation. Around epoche? More than a month in future?
				if (time < 2 || time > Date.now() + 30 * 86400000) {
					throw new Exception("invalid date encountered: " + time + ", will not set it");
				}
				// have to unwrap
				let file = new Instances.LocalFile(this.destinationFile);
				file.lastModifiedTime = time;
			}
			catch (ex) {
				log(LOG_ERROR, "Setting timestamp on file failed: ", ex);
			}
		}
		this.totalSize = this.partialSize = this.size;
		++Dialog.completed;

		this.complete();
	},
	finishDownload: function QI_finishDownload(exception) {
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
	complete: function QI_complete(exception) {
		this.chunks = [];
		this.speeds.clear();
		if (exception) {
			this.fail(_("accesserror"), _("permissions") + " " + _("destpath") + ". " + _("checkperm"), _("accesserror"));
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
		this.state = COMPLETE;
		this.status = TextCache_COMPLETE;
		this.visitors = new VisitorManager();
	},
	get maskURL() this.urlManager.usableURL,
	get maskURLPath() this.urlManager.usableURLPath,
	get maskCURL() this.maskURL.host + ((this.maskURLPath == "") ? "" : (Utils.SYSTEMSLASH + this.maskURLPath)),
	rebuildDestination: function QI_rebuildDestination() {
		try {
			let mask = Utils.removeFinalSlash(Utils.normalizeSlashes(Utils.removeFinalChar(
					this.mask.replace(Replacer.expr, this.rebuildDestination_replacer), "."
					))).split(Utils.SYSTEMSLASH);
			let file = new Instances.LocalFile(Utils.addFinalSlash(this.pathName));
			while (mask.length) {
				file.append(Utils.removeBadChars(mask.shift()).trim());
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
		}
		catch(ex) {
			this._destinationName = this.fileName;
			this._destinationPath = Utils.addFinalSlash(this.pathName);
			this._destinationNameFull = Utils.formatConflictName(
					this.destinationNameOverride ? this.destinationNameOverride : this._destinationName,
					this.conflicts
				);
			let file = new Instances.LocalFile(this.destinationPath);
			file.append(this.destinationName);
			this._destinationFile = file.path;
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
					this.fail(_("ndsa"), _("spacetemp"), _("freespace"));
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
				this.fail(_("ndsa"), _("spacedir"), _("freespace"));
				return false;
			}
			return true;
		}
		catch (ex) {
			log(LOG_ERROR, "size check threw", ex);
			this.fail(_("accesserror"), _("permissions") + " " + _("destpath") + ". " + _("checkperm"), _("accesserror"));
		}
		return false;
	},

	fail: function QI_fail(title, msg, state) {
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

	cancel: function QI_cancel(message) {
		try {
			if (this.is(COMPLETE)) {
				Dialog.completed--;
			}
			else if (this.is(RUNNING)) {
				if (this.chunks) {
					// must set state here, already, to avoid confusing the connections
					this.state = CANCELED;
					for (let [,c] in Iterator(this.chunks)) {
						if (c.running) {
							c.cancelChunk();
						}
					}
				}
				this.activeChunks = 0;
			}
			this.state = CANCELED;
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
			if (!this.deleting) {
				if (message == "" || !message) {
					message = _("canceled");
				}

				this.status = message;
				this.visitors = new VisitorManager();
				this.chunks = [];
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
			else {
				this.visitors = null;
				this.chunks = null;
				this.speeds = null;
			}
		}
		catch(ex) {
			log(LOG_ERROR, "cancel():", ex);
		}
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
	createDirectory: function QI_createDirectory(file) {
		if (file.parent.exists()) {
			return;
		}
		file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, Prefs.dirPermissions);
	},
	prealloc: function QI_prealloc(callback) {
		let file = this.tmpFile;

		if (!this.is(RUNNING)) {
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

	_donePrealloc: function QI__donePrealloc(res) {
		log(LOG_INFO, "pa: done");
		delete this._preallocator;
		this.preallocating = false;

		if (this._notifyPreallocation) {
			for (let [,c] in Iterator(this._notifyPreallocation)) {
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

	removeTmpFile: function QI_removeTmpFile() {
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
	pauseAndRetry: function QI_markRetry() {
		this.pause();
		this.resumable = true;
		this.save();

		if (Prefs.autoRetryInterval && !(Prefs.maxAutoRetries && Prefs.maxAutoRetries <= this._autoRetries)) {
			Dialog.markAutoRetry(this);
			this._autoRetryTime = Utils.getTimestamp();
			log(LOG_INFO, "marked auto-retry: " + this);
		}
	},
	autoRetry: function QI_autoRetry() {
		if (!this.autoRetrying || Utils.getTimestamp() - (Prefs.autoRetryInterval * 1000) < this._autoRetryTime) {
			return false;
		}

		this._autoRetryTime = 0;
		++this._autoRetries;
		this.queue();
		log(LOG_DEBUG, "Requeued due to auto-retry: " + this);
		return true;
	},
	clearAutoRetry: function QI_clearAutoRetry() {
		this._autoRetryTime = 0;
		this._autoRetries = 0;
	},
	queue: function QI_queue() {
		this._autoRetryTime = 0;
		this.state = QUEUED;
		this.status = TextCache_QUEUED;
	},
	maybeResumeDownload: function QI_maybeResumeDownload() {
		if (!this.is(RUNNING)) {
			return;
		}
		this.resumeDownload();
	},
	resumeDownload: function QI_resumeDownload() {
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
			chunk.running = true;
			download.state = RUNNING;
			log(LOG_DEBUG, "started: " + chunk);
			download.createDirectory(download.tmpFile);
			chunk.download = new Connection(download, chunk, header || download.mustGetInfo);
			download.mustGetInfo = false;
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
				for each (let chunk in this.chunks) {
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
		if (restart && this.resumable && this.is(RUNNING) && this.maxChunks > 2) {
			// stop some chunks and restart them
			log(LOG_DEBUG, "Stopping some chunks and restarting them after mirrors change");
			let omc = this.maxChunks;
			this.maxChunks = 2;
			this.maxChunks = omc;
		}
		this.invalidate();
		this.save();
	},
	dumpScoreboard: function QI_dumpScoreboard() {
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
		for (let i = 0, e = Dialog_serialize_props.length; i < e; ++i) {
			let u = Dialog_serialize_props[i];
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
		if (this.autoRetrying || this.is(RUNNING)) {
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

		if (!this.resumable && !this.is(COMPLETE)) {
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
	resolve: function CM_resolve(download, reentry) {
		if (!this._check(download)) {
			if (reentry) {
				download[reentry]();
			}
			return;
		}
		for each (let item in this._items.length) {
			if (item.download == download) {
				log(LOG_DEBUG, "conflict resolution updated to: " + reentry);
				item.reentry = reentry;
				return;
			}
		}
		log(LOG_DEBUG, "conflict resolution queued to: " + reentry);
		this._items.push({download: download, reentry: reentry});
		this._process();
	},
	_check: function CM__check(download) {
		let dest = new Instances.LocalFile(download.destinationFile);
		let sn = false;
		if (download.is(RUNNING)) {
			sn = Dialog.checkSameName(download, download.destinationFile);
		}
		log(LOG_DEBUG, "conflict check: " + sn + "/" + dest.exists() + " for " + download.destinationFile);
		return dest.exists() || sn;
	},
	_process: function CM__process() {
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
	_computeConflicts: function CM__computeConflicts(cur) {
		let download = cur.download;
		download.conflicts = 0;
		let basename = download.destinationName;
		let newDest = new Instances.LocalFile(download.destinationFile);
		let i = 1;
		for (;; ++i) {
			newDest.leafName = Utils.formatConflictName(basename, i);
			if (!newDest.exists() && (!download.is(RUNNING) || !Dialog.checkSameName(this, newDest.path))) {
				break;
			}
		}
		cur.newDest = newDest.leafName;
		cur.conflicts = i;
	},
	_returnFromDialog: function CM__returnFromDialog(option, type) {
		if (type == 1) {
			this._sessionSetting = option;
		}
		if (type == 2) {
			Preferences.setExt('conflictresolution', option);
		}
		this._return(option);
	},
	_return: function CM__return(option) {
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


function startDownloads(start, downloads) {

	let iNum = 0;
	let first = null;

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
			qi.bNum = e.numIstance;
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
			qi.fileName = Utils.getUsableFileName(qi.urlManager.usable);
			if (e.fileName) {
				qi.fileName = Utils.getUsableFileName(e.fileName);
			}
			if (e.destinationName) {
				qi.destinationName = Utils.getUsableFileName(e.destinationName);
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

			let postData = ContentHandling.getPostDataFor(qi.urlManager.url);
			if (e.url.postData) {
				postData = e.url.postData;
			}
			if (postData) {
				qi.postData = postData;
			}

			qi._state = start ? QUEUED : PAUSED;
			if (qi.is(QUEUED)) {
				qi.status = TextCache_QUEUED;
			}
			else {
				qi.status = TextCache_PAUSED;
			}
			qi.position = Tree.add(qi);
			qi.save();
			first = first || qi;
		}
		catch (ex) {
			log(LOG_ERROR, "addItem", ex);
		}

		return true;
	}

	let g = downloads;
	if ('length' in downloads) {
		g = (i for each (i in downloads));
	}

	Tree.beginUpdate();
	QueueStore.beginUpdate();
	let ct = new CoThreadListWalker(
		addItem,
		g,
		100
	).start(function() {
		QueueStore.endUpdate();
		Tree.endUpdate();
		Tree.invalidate();
		ct = null;
		g = null;
		Tree.scrollToNearest(first);
	});
}


addEventListener(
	"load",
	function() {
		removeEventListener("load", arguments.callee, false);
		if (!Preferences.getExt('startminimized', false)) {
			return;
		}
		// Only start minimized if invoked with new downloads
		if (!window.arguments || !window.arguments.length) {
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
