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

const Construct = Components.Constructor;
function Serv(c, i) { // leave in; anticontainer and others compat
	return Cc[c].getService(i ? Ci[i] : null);
}
const BufferedOutputStream = Construct('@mozilla.org/network/buffered-output-stream;1', 'nsIBufferedOutputStream', 'init');
const FileInputStream = Construct('@mozilla.org/network/file-input-stream;1', 'nsIFileInputStream', 'init');
const FileOutputStream = Construct('@mozilla.org/network/file-output-stream;1', 'nsIFileOutputStream', 'init');
const StringInputStream = Construct('@mozilla.org/io/string-input-stream;1', 'nsIStringInputStream', 'setData');
const Process = Construct('@mozilla.org/process/util;1', 'nsIProcess', 'init');

ServiceGetter(this, "ContentHandling", "@downthemall.net/contenthandling;3", "dtaIContentHandling");
ServiceGetter(this, "MimeService", "@mozilla.org/uriloader/external-helper-app-service;1", "nsIMIMEService");
ServiceGetter(this, "ObserverService", "@mozilla.org/observer-service;1", "nsIObserverService");
ServiceGetter(this, "WindowWatcherService", "@mozilla.org/embedcomp/window-watcher;1", "nsIWindowWatcher");

let Prompts = {}, Limits = {}, JSONCompat = {}, PrivateBrowsing = {};
module('resource://dta/cothread.jsm');
module('resource://dta/json.jsm', JSONCompat);
module('resource://dta/support/urlmanager.jsm');
module('resource://dta/prompts.jsm', Prompts);

module('resource://dta/support/bytebucket.jsm');
module('resource://dta/support/pbm.jsm', PrivateBrowsing);
module('resource://dta/support/serverlimits.jsm', Limits);
module('resource://dta/support/timers.jsm');
module('resource://dta/support/fileextsheet.jsm');

let Preallocator = {}, RequestManipulation = {};
module('resource://dta/manager/preallocator.jsm', Preallocator);
module('resource://dta/manager/connection.jsm');
module('resource://dta/manager/queuestore.jsm');
module('resource://dta/manager/speedstats.jsm');
module('resource://dta/manager/visitormanager.jsm');
module('resource://dta/manager/requestmanipulation.jsm', RequestManipulation);
module('resource://dta/manager/globalprogress.jsm');

function lazyModule(obj, name, url, symbol) {
	setNewGetter(obj, name, function() {
		let _o = {};
		module(url, _o);
		return symbol ? _o[symbol] : _o;
	});
}

lazyModule(this, 'AlertService', 'resource://dta/support/alertservice.jsm');
lazyModule(this, 'Decompressor', 'resource://dta/manager/decompressor.jsm', 'Decompressor');
lazyModule(this, 'Verificator', 'resource://dta/manager/verificator.jsm');
lazyModule(this, 'Version', 'resource://dta/version.jsm', 'Version');

setNewGetter(this, 'FileExts', function() new FileExtensionSheet(window));

var TEXT_PAUSED;
var TEXT_QUEUED;
var TEXT_COMPLETE;
var TEXT_CANCELED;


GlobalProgress = new GlobalProgress(window);
var Timers = new TimerManager();

const Dialog_loadDownloads_props = ['contentType', 'conflicts', 'postData', 'destinationName', 'resumable', 'compression', 'fromMetalink', 'speedLimit'];
function Dialog_loadDownloads_get(down, attr, def) (attr in down) ? down[attr] : (def ? def : '');

const Dialog_serialize_props = ['fileName', 'postData', 'description', 'title', 'resumable', 'mask', 'pathName', 'compression', 'maxChunks', 'contentType', 'conflicts', 'fromMetalink', 'speedLimit'];

const Dialog = {
	_observes: [
		'quit-application-requested',
		'quit-application-granted',
		'network:offline-status-changed',
		'DTA:filterschanged',
		'DTA:clearedQueueStore',
		'DTA:shutdownQueueStore'
	],
	_initialized: false,
	_autoRetrying: [],
	_offline: false,
	_maxObservedSpeed: 0,
	_infoWindows: [],

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

		TEXT_PAUSED = _('paused');
		TEXT_QUEUED = _('queued');
		TEXT_COMPLETE = _('complete');
		TEXT_CANCELED = _('canceled');

		(function initListeners() {
			addEventListener('unload', function() Dialog.unload(), false);
			addEventListener('close', function(evt) Dialog.onclose(evt), false);

			addEventListener('dragover', function(event) {
				try {
					if (event.dataTransfer.types.contains("text/x-moz-url")) {
						event.dataTransfer.dropEffect = "link";
						event.preventDefault();
					}
				}
				catch (ex) {
					Debug.log("failed to process ondragover", ex);
				}
			}, true);
			addEventListener('drop', function(event) {
				try {
					let url = event.dataTransfer.getData("URL");
					if (!url) {
						return;
					}
					if (!DTA.isLinkOpenable(url)) {
						throw new Components.Exception("Link cannot be opened!");
					}
					url = DTA.IOService.newURI(url, null, null);
					DTA.saveSingleLink(
						window,
						false,
						new DTA.URL(DTA.getLinkPrintMetalink(url) || url)
						);
				}
				catch (ex) {
					Debug.log("failed to process ondrop", ex);
				}
			}, true);

			$('tooldonate').addEventListener('click', function(evt) { if (evt.button == 0) Dialog.openDonate() }, false);
		})();

		let tree = $("downloads");
		Tree.init(tree);
		tree.addEventListener("change", function() {
			Debug.log("tree change");
			Dialog.scheduler = null;
		}, true);
		try {
			Timers.createOneshot(100, this._loadDownloads, this);
		}
		catch (ex) {
			Debug.log("Failed to load any downloads from queuefile", ex);
		}

		try {
			this.offline = IOService.offline;
		}
		catch (ex) {
			Debug.log("Cannot get offline status", ex);
		}

		Preferences.makeObserver(this);
		this._observes.forEach(
			function(topic) {
				ObserverService.addObserver(this, topic, true);
			},
			this
		);

		// Autofit
		(function autofit() {
			let de = document.documentElement;
			Components.utils.import('resource://dta/version.jsm', this);
			this.Version.getInfo(function(version) {
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
					setTimeout(
						function() {
							let tdb = $('tooldonate').boxObject;
							let db = de.boxObject
							let cw = tdb.width + tdb.x;
							if (db.width < cw) {
								window.resizeTo(cw, window.outerHeight);
								Debug.logString("manager was autofit");
							}
						},
						10
					);
				}
			});
		})();

		// Set tooltip texts for each tb button lacking one (copy label)
		(function() {
			for each (let e in Array.map(document.getElementsByTagName('toolbarbutton'), function(e) e)) {
				if (!e.hasAttribute('tooltiptext')) {
					e.setAttribute('tooltiptext', e.getAttribute('label'));
				}
			}

			$('tbp_' + $('tools').getAttribute('mode')).setAttribute('checked', "true");
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
				Debug.logString("nag: " + seq + "/" + nagnext + "/" + (seq - nagnext));
				if (seq < nagnext) {
					return;
				}
				for (nagnext = isFinite(nagnext) && nagnext > 0 ? nagnext : 100; seq >= nagnext; nagnext *= 2);

				seq = Math.floor(seq / 100) * 100;

				setTimeout(function() {
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
				Debug.log('nagger', ex);
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
		GlobalBucket.byteRate = val;
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
		Debug.logString("loading of the queue started!");
		GlobalProgress.reset();
		GlobalProgress.pause();
		let gen = QueueStore.loadGenerator();
		this._loader = new CoThreadListWalker(
			this._loadDownloads_item,
			gen,
			250,
			this
		);
		let self = this;
		this._loader.run(function() {
			gen = null;
			this._loadDownloads_finish();
		});
	},
	_loadDownloads_item: function D__loadDownloads_item(dbItem, idx) {
		if (!idx) {
			GlobalProgress.total = dbItem.count;
		}
		if (idx % 50 == 0) {
			GlobalProgress.value = idx;
		}
		if (idx % 100 == 0) {
			this._loading.label = _('loading', [idx, dbItem.count, Math.floor(idx * 100 / dbItem.count)]);
		}

		try {
			let down = JSONCompat.parse(dbItem.serial);

			let d = new QueueItem();
			d.dbId = dbItem.id;
			let state = Dialog_loadDownloads_get(down, 'state');
			if (state) {
				d._state = state;
			}
			d.urlManager = new UrlManager(down.urlManager);
			d.bNum = Dialog_loadDownloads_get(down, "numIstance");
			d.iNum = Dialog_loadDownloads_get(down, "iNum");

			let referrer = Dialog_loadDownloads_get(down, 'referrer');
			if (referrer) {
				try {
					d.referrer = referrer.toURL();
				}
				catch (ex) {
					// We might have been fed with about:blank or other crap. so ignore.
				}
			}

			// only access the setter of the last so that we don't generate stuff trice.
			d._pathName = Dialog_loadDownloads_get(down, 'pathName');
			d._description = Dialog_loadDownloads_get(down, 'description');
			d._title = Dialog_loadDownloads_get(down, 'title');
			d._mask = Dialog_loadDownloads_get(down, 'mask');
			d.fileName = Dialog_loadDownloads_get(down, 'fileName');

			let tmpFile = Dialog_loadDownloads_get(down, 'tmpFile');
			if (tmpFile) {
				try {
					tmpFile = new FileFactory(tmpFile);
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
					Debug.log("tried to construct with invalid tmpFile", ex);
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
						d.status = TEXT_PAUSED;
					}
					else {
						d.status = TEXT_QUEUED;
					}
				}
				break;

				case COMPLETE:
					d.partialSize = d.totalSize;
					d.status = TEXT_COMPLETE;
				break;

				case CANCELED:
					d.status = TEXT_CANCELED;
				break;
			}

			// XXX better call this only once
			// See above
			d.rebuildDestination();

			d._position = Tree.add(d);
		}
		catch (ex) {
			Debug.log('failed to init download #' + dbItem.id + ' from queuefile', ex);
			this._brokenDownloads.push(dbItem.id);
		}
		return true;
	},
	_loadDownloads_finish: function D__loadDownloads_finish() {
		delete this._loader;
		Tree.endUpdate();
		Tree.invalidate();

		if (this._brokenDownloads.length) {
			QueueStore.beginUpdate();
			try {
				for each (let id in this._brokenDownloads) {
					QueueStore.deleteDownload(id);
					Debug.logString("Removed broken download #" + id);
				}
			}
			catch (ex) {
				Debug.log("failed to remove broken downloads", ex);
			}
			QueueStore.endUpdate();
		}
		delete this._brokenDownloads;
		delete this._loading;

		GlobalProgress.reset();

		this._updTimer = Timers.createRepeating(REFRESH_FREQ, this.checkDownloads, this, true);

		this.start();
	},

	enterPrivateBrowsing: function() {
		Debug.logString("enterPrivateBrowsing");
		this.reinit(false);
	},
	exitPrivateBrowsing: function() {
		Debug.logString("exitPrivateBrowsing");
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
		if (w) {
			this._infoWindows.push(w);
		}
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
		for (let d in Tree.all) {
			if (d.is(FINISHING)) {
				this.run(d);
			}
		}
		Timers.createRepeating(100, this.refreshWritten, this, true);
		Timers.createRepeating(10000, this.saveRunning, this);

		$('loadingbox').parentNode.removeChild($('loadingbox'));
	},

	reinit: function(mustClear) {
		if (!this._initialized) {
			Debug.logString("reinit canceled");
			return;
		}
		let method = mustClear ? 'cancel' : 'pause';
		Tree.updateAll(function(download) {
			if (!download.is(COMPLETE)) {
				download[method]();
			}
			return true;
		});
		Debug.logString("reinit downloads canceled");
		try {
			Debug.logString("reinit initiated");
			let tp = this;
			Timers.createOneshot(10, function() tp.shutdown(tp._continueReinit), this);
		}
		catch (ex) {
			Debug.log("reinit: Failed to reload any downloads from queuefile", ex);
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
					Debug.log("cannot set cancelQuit", ex);
				}
			}
		}
		else if (topic == 'quit-application-granted') {
			this._forceClose = true;
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
			Debug.logString("saving running");
			this.saveRunning();
		}
	},
	refresh: function D_refresh() {
		try {
			const now = Utils.getTimestamp();
			for each (let d in this._running) {
				d.refreshPartialSize();
				let advanced = d.speeds.add(d.partialSize, now);
				this._sum += advanced;

				// Calculate estimated time
				if (advanced != 0 && d.totalSize > 0) {
					let remaining = Math.ceil((d.totalSize - d.partialSize) / d.speeds.avg);
					if (!isFinite(remaining)) {
						d.status = _("unknown");
					}
					else {
						d.status = Utils.formatTimeDelta(remaining);
					}
				}
				d.speed = Utils.formatSpeed(d.speeds.avg);
				if (d.speedLimit > 0) {
					d.speed += " (" + Utils.formatSpeed(d.speedLimit, 0) + ")";
				}
			}
			this._speeds.add(this._sum, now);
			speed = Utils.formatSpeed(this._speeds.avg);
			this._maxObservedSpeed = Math.max(this._speeds.avg, this._maxObservedSpeed);
			for each (let e in $('listSpeeds', 'perDownloadSpeedLimitList')) {
				e.hint = this._maxObservedSpeed;
			}

			// Refresh status bar
			$('statusText').label = _("currentdownloads", [this.completed, Tree.rowCount, this._running.length]);
			$('statusSpeed').label = speed;

			// Refresh window title
			if (this._running.length == 1 && this._running[0].totalSize > 0) {
				document.title =
					this._running[0].percent
					+ ' - '
					+ this.completed + "/" + Tree.rowCount + " - "
					+ $('statusSpeed').label + ' - DownThemAll!';
				if (this._running[0].totalSize) {
					GlobalProgress.activate(this._running[0].progress * 10, 1000);
				}
				else {
					GlobalProgress.unknown();
				}
			}
			else if (this._running.length > 0) {
				let p = Math.floor(this.completed * 1000 / Tree.rowCount);
				document.title =
					Math.floor(this.completed * 100 / Tree.rowCount) + '%'
					+ ' - '
					+ this.completed + "/" + Tree.rowCount + " - "
					+ $('statusSpeed').label + ' - DownThemAll!';
				GlobalProgress.activate(p, 1000);
			}
			else {
				if (Tree.rowCount) {
					let state = COMPLETE;
					for (let d in Tree.all) {
						if (d.is(CANCELED)) {
							state = CANCELED;
							break;
						}
						if (d.is(PAUSED)) {
							state = PAUSED;
							break;
						}
					}
					let p = Math.floor(this.completed * 1000 / Tree.rowCount);
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
				document.title = this.completed + "/" + Tree.rowCount + " - DownThemAll!";
			}
			($('titlebar') || {}).value = document.title;
		}
		catch(ex) {
			Debug.log("refresh():", ex);
		}
	},
	refreshWritten: function D_refreshWritten() {
		for each (let d in this._running) {
			d.refreshPartialSize();
			d.invalidate();
		}
	},
	saveRunning: function D_saveRunning() {
		if (!this._running.length) {
			return;
		}
		for each (let d in this._running) {
			d.save();
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
			for (let d in Tree.all) {
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
		try {
			this.refresh();

			let ts = Utils.getTimestamp();
			for each (let d in this._running) {
				// checks for timeout
				if (d.is(RUNNING) && (ts - d.timeLastProgress) >= Prefs.timeout * 1000) {
					if (d.resumable || !d.totalSize || !d.partialSize || Prefs.resumeOnError) {
						d.pauseAndRetry();
						d.status = _("timeout");
					}
					else {
						d.cancel(_("timeout"));
					}
					Debug.logString(d + " is a timeout");
				}
			}

			if (Prefs.autoClearComplete && this._autoClears.length) {
				Tree.remove(this._autoClears);
				this._autoClears = [];
			}

			if (!this.offline) {
				if (Prefs.autoRetryInterval) {
					this._autoRetrying = this._autoRetrying.filter(function(d) !d.autoRetry());
				}
				this.startNext();
			}
		}
		catch(ex) {
			Debug.log("checkDownloads():", ex);
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
			if (!this.scheduler) {
				this.scheduler = Limits.getConnectionScheduler(Tree._downloads, this._running);
				Debug.log("rebuild scheduler");
			}
			while (this._running.length < Prefs.maxInProgress) {
				let d = this.scheduler.next(this._running);
				if (!d) {
					break;
				}
				if (!d.is(QUEUED)) {
					Debug.logString("FIXME: scheduler returned unqueued download");
					continue;
				}
				this.run(d);
				rv = true;
			}
			return rv;
		}
		catch(ex){
			Debug.log("startNext():", ex);
		}
		return false;
	},
	run: function D_run(download) {
		if (this.offline) {
			return;
		}
		download.status = _("starting");
		if (download.is(FINISHING) || (download.partialSize >= download.totalSize && download.totalSize)) {
			// we might encounter renaming issues;
			// but we cannot handle it because we don't know at which stage we crashed
			download.partialSize = download.totalSize;
			Debug.logString("Download seems to be complete; likely a left-over from a crash, finish it:" + download);
			download.finishDownload();
			return;
		}
		download.timeLastProgress = Utils.getTimestamp();
		download.timeStart = Utils.getTimestamp();
		download.state = RUNNING;
		if (!download.started) {
			download.started = true;
			Debug.logString("Let's start " + download);
		}
		else {
			Debug.logString("Let's resume " + download + " at " + download.partialSize);
		}
		if (!this._running.length) {
			this._speeds.clear(); // started to run; remove old global speed stats
		}
		this._running.push(download);
		download.prealloc();
		download.resumeDownload();
	},
	wasStopped: function D_wasStopped(download) {
		this._running = this._running.filter(function (d) d != download);
	},
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
			if (this.startNext() || Tree.some(function(d) { return d.isOf(FINISHING | RUNNING | QUEUED); } )) {
				return;
			}
			Debug.logString("signal(): Queue finished");
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
			Debug.log("signal():", ex);
		}
	},
	markAutoRetry: function D_markAutoRetry(d) {
		if (this._autoRetrying.indexOf(d) == -1) {
			this._autoRetrying.push(d);
		}
	},	
	wasRemoved: function D_wasRemoved(d) {
		this._running = this._running.filter(function(r) r != d);
		this._autoRetrying = this._autoRetrying.filter(function(r) r != d);
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
		Debug.logString("Close request");
		if (!this._initialized) {
			Debug.logString("not initialized. Going down immediately!");
			callback.call(this);
			return true;
		}
		if (!this._forceClose && !this._canClose()) {
			delete this._forceClose;
			Debug.logString("Not going to close!");
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
		Debug.logString("Going to close all");
		Tree.updateAll(
			function(d) {
				if (d.isOf(RUNNING | QUEUED)) {
					// enumerate all running chunks
					d.chunks.forEach(
						function(c) {
							if (c.running) {
								++chunks;
							}
						},
						this
					);
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
		Debug.logString("Still running: " + chunks + " Finishing: " + finishing);
		if (chunks || finishing) {
			if (this._safeCloseAttempts < 20) {
				++this._safeCloseAttempts;
				let tp = this;
				Timers.createOneshot(250, function() tp.shutdown(callback), this);
				return false;
			}
			Debug.logString("Going down even if queue was not probably closed yet!");
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
		for (d in Tree.all) {
			known.push(d.tmpFile.leafName);
		}
		let tmpEnum = Prefs.tempLocation.directoryEntries;
		let unknown = [];
		for (let f in new Utils.SimpleIterator(tmpEnum, Ci.nsILocalFile)) {
			if (f.leafName.match(/\.dtapart$/) && known.indexOf(f.leafName) == -1) {
				unknown.push(f);
			}
		}
		unknown.forEach(
			function(f) {
				try {
					f.remove(false);
				}
				catch(ex) {
				}
			}
		);
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
			Debug.log("_safeClose", ex);
		}
		for each (let w in this._infoWindows) {
			if (!w.closed) {
				w.close();
			}
		}

		// some more gc
		Tree._downloads.forEach(function(d) delete d._icon);
		delete Tree._downloads;
		Tree = null;
		FileExts = null;
		Dialog = null;
		return true;
	}
};
addEventListener('load', function() Dialog.init(), false);

const Metalinker = {
	handleDownload: function ML_handleDownload(download) {
		download.state = CANCELED;
		Tree.remove(download, false);
		let file = new FileFactory(download.destinationFile);

		this.handleFile(file, download.referrer, function() {
			try {
				file.remove(false);
			}
			catch (ex) {
				Debug.log("failed to remove metalink file!", ex);
			}			
		});
	},
	handleFile: function ML_handleFile(aFile, aReferrer, aCallback) {
		this.parse(aFile, aReferrer, function (res, ex) {
			try {
				if (ex) {
					throw ex;
				}
				if (!res.downloads.length) {
					throw new Error(_('mlnodownloads'));
				}
				res.downloads.forEach(function(e) {
					if (e.size) {
						e.size = Utils.formatBytes(e.size);
					}
					e.fileName = e.fileName.getUsableFileName();
				});
				window.openDialog(
					'chrome://dta/content/dta/manager/metaselect.xul',
					'_blank',
					'chrome,centerscreen,dialog=yes,modal',
					res.downloads,
					res.info
				);
				res.downloads = res.downloads.filter(function(d) { return d.selected; });
				if (res.downloads.length) {
					startDownloads(res.info.start, res.downloads);
				}
			}
			catch (ex) {
				Debug.log("Metalinker::handleDownload", ex);
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
module('resource://dta/support/metalinker.jsm', Metalinker);

function QueueItem(lnk, dir, num, desc, mask, referrer, tmpFile) {

	this.visitors = new VisitorManager();

	this.startDate = new Date();

	this.chunks = [];
	this.speeds = new SpeedStats(SPEED_COUNT);
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
		this.rebuildDestination();
		this.invalidate(0);
		return nv;
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
		this._mask = nv;
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
				: new FileFactory(this.destinationPath);
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
			: _('nas');
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
			QueueStore.saveDownload(this.dbId, this.serialize());
			return true;
		}

		this.dbId = QueueStore.addDownload(this.serialize(), this.position);
		return true;
	},
	remove: function QI_remove() {
		QueueStore.deleteDownload(this.dbId);
		delete this.dbId;
	},
	_position: -1,
	get position() {
		return this._position;
	},
	set position(nv) {
		if (nv == this._position) {
			return;
		}
		this._position = nv;
		if (this.dbId && this._position != -1) {
			QueueStore.savePosition(this.dbId, this._position);
		}
	},

	contentType: "",
	visitors: null,
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

	startDate: null,

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
		if (!this._maxChunks) {
				this._maxChunks = Prefs.maxChunks;
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
				c.cancel();
			}
		}
		else if (this._maxChunks > this._activeChunks && this.is(RUNNING)) {
			this.resumeDownload();

		}
		this.invalidate(6);
		Debug.logString("mc set to " + nv);
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
		return getIcon(this.destinationName, 'metalink' in this, 32);
	},
	get size() {
		try {
			let file = null;
			if (!this.isOf(COMPLETE | FINISHING)) {
				file = this._tmpFile || null;
			}
			else {
				file = new FileFactory(this.destinationFile);
			}
			if (file && file.exists()) {
				return file.fileSize;
			}
		}
		catch (ex) {
			Debug.log("download::getSize(): ", ex);
		}
		return 0;
	},
	get dimensionString() {
		if (this.partialSize <= 0) {
			return _('unknown');
		}
		else if (this.totalSize <= 0) {
			return _('transfered', [Utils.formatBytes(this.partialSize), _('nas')]);
		}
		else if (this.is(COMPLETE)) {
			return Utils.formatBytes(this.totalSize);
		}
		return _('transfered', [Utils.formatBytes(this.partialSize), Utils.formatBytes(this.totalSize)]);
	},
	_status : '',
	get status() {
		if (Dialog.offline && this.isOf(QUEUED | PAUSED)) {
			return _('offline');
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
			return _('nas');
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
		this.chunks.forEach(function(c) { c.cancel(); });
		this.chunks = [];
		this.speeds.clear();
		this.visitors = new VisitorManager();
		this.state = QUEUED;
		Dialog.run(this);
	},

	refreshPartialSize: function QI_refreshPartialSize(){
		let size = 0;
		for (let c in this.chunks) {
			size += this.chunks[c].written;
		}
		this.partialSize = size;
		this.progress = Math.round(size * 100.0 / this._totalSize);
	},

	pause: function QI_pause(){
		if (this.chunks) {
			for each (let c in this.chunks) {
				if (c.running) {
					c.cancel();
				}
			}
		}
		this.activeChunks = 0;
		this.state = PAUSED;
		this.speeds.clear();
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
			this.chunks.forEach(function(c) { c.close(); });
			var destination = new FileFactory(this.destinationPath);
			Debug.logString(this.fileName + ": Move " + this.tmpFile.path + " to " + this.destinationFile);

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
				this.status =  _("decompress");
				new Decompressor(this);
			}
			else {
				function move(self, x) {
					try {
						self.tmpFile.clone().moveTo(destination, self.destinationName);
					}
					catch (ex) {
						x = x || 1;
						if (x > 5) {
							self.complete(ex);
							return;
						}
						window.setTimeout(function() move(self, ++x), x * 250);
						return;
					}
					self.complete();
				}
				move(this);
			}
		}
		catch(ex) {
			Debug.log("continueMoveCompleted encountered an error", ex);
			this.complete(ex);
		}
	},
	handleMetalink: function QI_handleMetaLink() {
		try {
			Metalinker.handleDownload(this);
		}
		catch (ex) {
			Debug.log("handleMetalink", ex);
		}
	},
	_verificator: null,
	verifyHash: function() {
		this.state = FINISHING;
		this.status = _("verify");
		let tp = this;
		this._verificator = Verificator.verify(
			this.tmpFile.exists() ? this.tmpFile.path : this.destinationFile,
			this.hashCollection,
			function(mismatches) {
				delete tp._verificator;
				tp._verificator = null;

				if (!mismatches) {
					Debug.logString("hash not computed");
					Prompts.alert(window, _('error'), _('verificationfailed', [tp.destinationFile]));
					tp.complete();
				}
				else if (mismatches.length) {
					Debug.logString("Mismatches: " + mismatches.toSource());
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
		let file = new FileFactory(this.destinationFile);
		mismatches = mismatches.filter(function(e) e.start != e.end);

		function deleteFile() {
			try {
				if (file.exists()) {
					file.remove(false);
				}
			}
			catch (ex) {
				Debug.log("Failed to remove file after checksum mismatch", ex);
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
				Debug.logString("Inserting last");
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
				let file = new FileFactory(this.destinationFile);
				file.lastModifiedTime = time;
			}
			catch (ex) {
				Debug.log("Setting timestamp on file failed: ", ex);
			}
		}
		this.totalSize = this.partialSize = this.size;
		++Dialog.completed;

		this.complete();
	},
	finishDownload: function QI_finishDownload(exception) {
		Debug.logString("finishDownload, connections: " + this.sessionConnections);
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
			Debug.log("complete: ", exception);
			return;
		}
		if (this._completeEvents.length) {
			var evt = this._completeEvents.shift();
			var tp = this;
			window.setTimeout(
				function() {
					try {
						tp[evt]();
					}
					catch(ex) {
						Debug.log("completeEvent failed: " + evt, ex);
						tp.complete();
					}
				},
				0
			);
			return;
		}
		this.activeChunks = 0;
		this.state = COMPLETE;
		this.status = TEXT_COMPLETE;
		this.visitors = new VisitorManager();
	},
	rebuildDestination: function QI_rebuildDestination() {
		try {
			let uri = this.urlManager.usable.toURL();
			let host = uri.host.toString();

			// normalize slashes
			let mask = this.mask
				.normalizeSlashes()
				.removeLeadingSlash()
				.removeFinalSlash();

			let uripath = {
				get value() {
					let rv = uri.path.removeLeadingChar("/");
					if (rv.length) {
						rv = rv.substring(0, uri.path.lastIndexOf("/"))
							.normalizeSlashes()
							.removeFinalSlash();
					}
					delete this.value;
					return (this.value = rv);
				}
			};

			let query = '';
			try {
				query = uri.query;
			}
			catch (ex) {
				// no-op
			}

			let name = this.fileName;
			let ext = name.getExtension();
			if (ext) {
				name = name.substring(0, name.length - ext.length - 1);

				if (this.contentType && /htm/.test(this.contentType) && !/htm/.test(ext)) {
					ext += ".html";
				}
			}
			// mime-service method
			else if (this.contentType && /^(?:image|text)/.test(this.contentType)) {
				try {
					let info = MimeService.getFromTypeAndExtension(this.contentType.split(';')[0], "");
					ext = info.primaryExtension;
				} catch (ex) {
					ext = '';
				}
			}
			else {
				name = this.fileName;
				ext = '';
			}

			let tp = this;
			function curl() uri.host + ((uripath.value == "") ? "" : (SYSTEMSLASH + uripath.value));
			let replacements = {
				"name": function() name,
				"ext": function() ext,
				"text": function() tp.description.removeBadChars().replaceSlashes(' ').trim(),
				"flattext": function() tp.description.removeBadChars().getUsableFileNameWithFlatten(),
				'title': function() tp.title.removeBadChars().trim(),
				'flattitle': function() tp.title.removeBadChars().getUsableFileNameWithFlatten(),
				"url": function() host,
				"subdirs": function() uripath.value,
				"flatsubdirs": function() uripath.value.getUsableFileNameWithFlatten(),
				"refer": function() tp.referrer ? tp.referrer.host.toString() : '',
				"qstring": function() query,
				"curl": function() curl(),
				"flatcurl": function() curl().getUsableFileNameWithFlatten(),
				"num": function() Utils.formatNumber(tp.bNum),
				"inum": function() Utils.formatNumber(tp.iNum),
				"hh": function() Utils.formatNumber(tp.startDate.getHours(), 2),
				"mm": function() Utils.formatNumber(tp.startDate.getMinutes(), 2),
				"ss": function() Utils.formatNumber(tp.startDate.getSeconds(), 2),
				"d": function() Utils.formatNumber(tp.startDate.getDate(), 2),
				"m": function() Utils.formatNumber(tp.startDate.getMonth() + 1, 2),
				"y": function() tp.startDate.getFullYear().toString()
			}
			function replacer(type) {
				let t = type.substr(1, type.length - 2);
				if (t in replacements) {
					return replacements[t]();
				}
				return type;
			}

			mask = mask.replace(/\*\w+\*/gi, replacer)
				.removeFinalChar(".")
				.normalizeSlashes()
				.removeFinalSlash()
				.split(SYSTEMSLASH);
			let file = new FileFactory(this.pathName.addFinalSlash());
			while (mask.length) {
				file.append(mask.shift().removeBadChars().trim());
			}
			this._destinationName = file.leafName;
			this._destinationPath = file.parent.path;
		}
		catch(ex) {
			this._destinationName = this.fileName;
			this._destinationPath = this.pathName.addFinalSlash();
			Debug.log("rebuildDestination():", ex);
		}
		this._destinationNameFull = Utils.formatConflictName(
			this.destinationNameOverride ? this.destinationNameOverride : this._destinationName,
			this.conflicts
		);
		let file = new FileFactory(this.destinationPath);
		file.append(this.destinationName);
		this._destinationFile = file.path;
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
				Debug.logString("nsd: " +  nsd + ", tsd: " + required);
				this.fail(_("ndsa"), _("spacedir"), _("freespace"));
				return false;
			}
			return true;
		}
		catch (ex) {
			Debug.log("size check threw", ex);
			this.fail(_("accesserror"), _("permissions") + " " + _("destpath") + ". " + _("checkperm"), _("accesserror"));
		}
		return false;
	},

	fail: function QI_fail(title, msg, state) {
		Debug.logString("failDownload invoked");

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

	cancel: function QI_cancel(message) {
		try {
			if (this.is(CANCELED)) {
				return;
			}
			if (this.is(COMPLETE)) {
				Dialog.completed--;
			}
			else if (this.is(RUNNING)) {
				this.pause();
			}
			this.state = CANCELED;
			Debug.logString(this.fileName + ": canceled");

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
				this.maxChunks = this.activeChunks = 0;
				this.conflicts = 0;
				this.resumable = true;
				this._autoRetries = 0;
				delete this._autoRetryTime;
				this.save();
			}
			else {
				this.visitors = null;
				this.chunks = null;
				this.speeds = null
			}
		}
		catch(ex) {
			Debug.log("cancel():", ex);
		}
	},

	prealloc: function QI_prealloc() {
		let file = this.tmpFile;

		if (!this.is(RUNNING)) {
			return false;
		}

		if (!this.totalSize) {
			Debug.logString("pa: no totalsize");
			return false;
		}
		if (this.preallocating) {
			Debug.logString("pa: already working");
			return true;
		}

		if (!file.exists() || this.totalSize != this.size) {
			if (!file.parent.exists()) {
				file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, Prefs.dirPermissions);
			}
			let pa = Preallocator.prealloc(file, this.totalSize, Prefs.permissions, this._donePrealloc, this);
			if (pa) {
				this.preallocating = true;
				this._preallocator = pa;
				Debug.logString("pa: started");
			}
		}
		else {
			Debug.logString("pa: already allocated");
		}
		return this.preallocating;
	},
	cancelPreallocation: function() {
		if (this._preallocator) {
			Debug.logString("pa: going to cancel");
			this._preallocator.cancel();
			delete this._preallocator;
			this._preallocator = null;
			Debug.logString("pa: cancelled");
		}
		this.preallocating = false;
	},

	_donePrealloc: function QI__donePrealloc(res) {
		Debug.logString("pa: done");
		delete this._preallocator;
		this._preallocator = null;
		this.preallocating = false;
		if (this.is(RUNNING)) {
			this.resumeDownload();
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
				Debug.log("failed to remove tmpfile: " + this.tmpFile.path, ex);
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
		if (Prefs.autoRetryInterval && !(Prefs.maxAutoRetries && Prefs.maxAutoRetries <= this._autoRetries)) {
			Dialog.markAutoRetry(this);
			this._autoRetryTime = Utils.getTimestamp();
			Debug.logString("marked auto-retry: " + this);
		}

		this.pause();
		this.save();
	},
	autoRetry: function QI_autoRetry() {
		if (!this.autoRetrying || Utils.getTimestamp() - (Prefs.autoRetryInterval * 1000) < this._autoRetryTime) {
			return false;
		}

		this._autoRetryTime = 0;
		++this._autoRetries;
		this.queue();
		Debug.logString("Requeued due to auto-retry: " + this);
		return true;
	},
	clearAutoRetry: function QI_clearAutoRetry() {
		this._autoRetryTime = 0;
		this._autoRetries = 0;
	},
	queue: function QI_queue() {
		this._autoRetryTime = 0;
		this.state = QUEUED;
		this.status = TEXT_QUEUED;
	},
	resumeDownload: function QI_resumeDownload() {
		Debug.logString("resumeDownload: " + this);
		function cleanChunks(d) {
			// merge finished chunks together, so that the scoreboard does not bloat
			// that much
			for (let i = d.chunks.length - 2; i > -1; --i) {
				let c1 = d.chunks[i], c2 = d.chunks[i + 1];
				if (c1.complete && c2.complete) {
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
			Debug.logString("started: " + chunk);
			chunk.download = new Connection(download, chunk, header);
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
					Debug.logString("not resuming download " + this + " because preallocating");
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
			Debug.log("resumeDownload():", ex);
		}
		return false;
	},
	replaceMirrors: function(mirrors) {
		let restart = this.urlManager.length < 3;
		this.urlManager.initByArray(mirrors);
		if (restart && this.resumable && this.is(RUNNING) && this.maxChunks > 2) {
			// stop some chunks and restart them
			Debug.logString("Stopping some chunks and restarting them after mirrors change");
			let omc = this.maxChunks;
			this.maxChunks = 2;
			this.maxChunks = omc;
		}
		this.save();
	},
	dumpScoreboard: function QI_dumpScoreboard() {
		let scoreboard = '';
		let len = this.totalSize.toString().length;
		this.chunks.forEach(
			function(c,i) {
				scoreboard += i
					+ ": "
					+ c
					+ "\n";
			}
		);
		Debug.logString("scoreboard\n" + scoreboard);
	},
	toString: function() this.urlManager.usable,
	serialize: function() {
		let e = {};
		Dialog_serialize_props.forEach(
			function(u) {
				// only save what is changed
				if (this.__proto__[u] !== this[u]) {
					e[u] = this[u];
				}
			},
			this
		);
		if (this._maxChunks) {
			e.maxChunks = this.maxChunks;
		}
		if (this.hashCollection) {
			e.hashCollection = this.hashCollection.serialize();
		}
		if (this.autoRetrying || this.is(RUNNING)) {
			e.state = QUEUED;
		}
		else {
			e.state = this.state;
		}
		if (this.destinationNameOverride) {
			e.destinationName = this.destinationNameOverride;
		}
		if (this.referrer) {
			e.referrer = this.referrer.spec;
		}
		e.numIstance = this.bNum;
		e.iNum = this.iNum;
		// Store this so we can later resume.
		if (!this.isOf(CANCELED | COMPLETE) && this.partialSize) {
			e.tmpFile = this.tmpFile.path;
		}
		e.startDate = this.startDate.getTime();

		e.urlManager = this.urlManager.serialize();
		e.visitors = this.visitors.serialize();

		if (!this.resumable && !this.is(COMPLETE)) {
			e.totalSize = 0;
		}
		else {
			e.totalSize = this.totalSize;
		}

		e.chunks = [];

		if (this.isOf(RUNNING | PAUSED | QUEUED) && this.resumable) {
			for each (let c in this.chunks) {
				e.chunks.push({start: c.start, end: c.end, written: c.safeBytes});
			}
		}
		return JSONCompat.stringify(e);
	}
}
setNewGetter(QueueItem.prototype, 'AuthPrompts', function() {
	let _l = {};
	module('resource://dta/support/loggedprompter.jsm', _l);
	return new _l.LoggedPrompter(window);
}
);


function Chunk(download, start, end, written) {
	// saveguard against null or strings and such
	this._written = written > 0 ? written : 0;
	this._buffered = 0;
	this._start = start;
	this._end = end;
	this.end = end;
	this._parent = download;
	this._sessionBytes = 0;
}

Chunk.prototype = {
	running: false,
	get starter() {
		return this.end <= 0;
	},
	get start() {
		return this._start;
	},
	get end() {
		return this._end;
	},
	set end(nv) {
		this._end = nv;
		this._total = this._end - this._start + 1;
	},
	get total() {
		return this._total;
	},
	get written() {
		return this._written;
	},
	get safeBytes() {
		return this.written - this._buffered;
	},
	get remainder() {
		return this._total - this._written;
	},
	get complete() {
		if (this._end == -1) {
			return this.written != 0;
		}
		return this._total == this.written;
	},
	get parent() {
		return this._parent;
	},
	get sessionBytes() {
		return this._sessionBytes;
	},
	merge: function CH_merge(ch) {
		if (!this.complete && !ch.complete) {
			throw new Error("Cannot merge incomplete chunks this way!");
		}
		this.end = ch.end;
		this._written += ch._written;
	},
	open: function CH_open() {
		this._sessionBytes = 0;
		let file = this.parent.tmpFile;
		if (!file.parent.exists()) {
			file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, Prefs.dirPermissions);
		}
		let outStream = new FileOutputStream(file, 0x02 | 0x08, Prefs.permissions, 0);
		let seekable = outStream.QueryInterface(Ci.nsISeekableStream);
		seekable.seek(0x00, this.start + this.written);
		this._outStream = new BufferedOutputStream(outStream, MIN_CHUNK_SIZE * 2);

		this.buckets = new ByteBucketTee(
				this.parent.bucket,
				Limits.getServerBucket(this.parent),
				GlobalBucket
				);
		this.buckets.register(this);
	},
	close: function CH_close() {
		this.running = false;
		if (this._outStream) {
			this._outStream.flush();
			this._outStream.close();
			delete this._outStream;
		}
		this._buffered = 0;
		if (this.parent.is(CANCELED)) {
			this.parent.removeTmpFile();
		}
		if (this.buckets) {
			this.buckets.unregister(this);
		}
		delete this._req;
		this._sessionBytes = 0;
	},
	rollback: function CH_rollback() {
		if (!this._sessionBytes || this._sessionBytes > this._written) {
			return;
		}
		this._written -= this._sessionBytes;
		this._sessionBytes = 0;
	},
	cancel: function CH_cancel() {
		this.running = false;
		this.close();
		if (this.download) {
			this.download.cancel();
		}
	},
	_wnd: 0,
	_written: 0,
	_outStream: null,
	write: function CH_write(aRequest, aInputStream, aCount) {
		try {
			// not running: do not write anything
			if (!this.running) {
				return -1;
			}
			if (!this._outStream) {
				this.open();
				this._wnd = 1024;
			}
			let bytes = this.remainder;
			if (!this.total || aCount < bytes) {
				bytes = aCount;
			}
			if (!bytes) {
				// we got what we wanted
				return -1;
			}
			bytes = Math.min(Math.round(this._wnd), bytes);
			let got = this.buckets.requestBytes(bytes);
			if (got < bytes) {
				this._wnd = Math.max(this._wnd * 0.5, 512);
				this._req = aRequest;
				this._req.suspend();
			}
			else {
				this._wnd += 256;
			}
			bytes = got;
			if (!bytes) {
				return bytes;
			}
			if (bytes < 0) {
				throw new Exception("bytes negative");
			}
			// we're using nsIFileOutputStream
			if (this._outStream.writeFrom(aInputStream, bytes) != bytes) {
				throw ("chunks::write: read/write count mismatch!");
			}
			this._written += bytes;
			this._sessionBytes += bytes;
			this._buffered = Math.min(MIN_CHUNK_SIZE * 2, this._buffered + bytes);

			this.parent.timeLastProgress = Utils.getTimestamp();

			return bytes;
		}
		catch (ex) {
			Debug.log('write: ' + this.parent.tmpFile.path, ex);
			throw ex;
		}
		return 0;
	},
	observe: function() {
		if (!this._req) {
			return;
		}
		let req = this._req;
		delete this._req;
		req.resume();
	},
	toString: function() {
		let len = this.parent.totalSize ? String(this.parent.totalSize).length  : 10;
		return Utils.formatNumber(this.start, len)
			+ "/"
			+ Utils.formatNumber(this.end, len)
			+ "/"
			+ Utils.formatNumber(this.total, len)
			+ " running:"
			+ this.running
			+ " written/remain/sb:"
			+ Utils.formatNumber(this.written, len)
			+ "/"
			+ Utils.formatNumber(this.remainder, len)
			+ "/"
			+ Utils.formatNumber(this._sessionBytes, len);
	}
}

function startDownloads(start, downloads) {

	let iNum = 0;
	let first = null;

	function addItem(e) {
		try {
			let qi = new QueueItem();
			let lnk = e.url;
			if (typeof lnk == 'string') {
				qi.urlManager = new UrlManager([new DTA.URL(IOService.newURI(lnk, null, null))]);
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
					qi.referrer = e.referrer.toURL();
				}
				catch (ex) {
					// We might have been fed with about:blank or other crap. so ignore.
				}
			}
			// only access the setter of the last so that we don't generate stuff trice.
			qi._pathName = e.dirSave.addFinalSlash().toString();
			qi._description = !!e.description ? e.description : '';
			qi._title = !!e.title ? e.title : '';
			qi._mask = e.mask;
			qi.fromMetalink = !!e.fromMetalink;
			qi.fileName = qi.urlManager.usable.getUsableFileName();
			if (e.fileName) {
				qi.fileName = e.fileName.getUsableFileName();
			}
			if (e.destinationName) {
				qi.destinationName = e.destinationName.getUsableFileName();
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
				qi.status = TEXT_QUEUED;
			}
			else {
				qi.status = TEXT_PAUSED;
			}
			qi._position = Tree.add(qi);
			qi.save();
			first = first || qi;
		}
		catch (ex) {
			Debug.log("addItem", ex);
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
	).run(function() {
		QueueStore.endUpdate();
		Tree.endUpdate();
		ct = null;
		g = null;
		Tree.scrollToNearest(first);
	});
}

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
				Debug.logString("conflict resolution updated to: " + reentry);
				item.reentry = reentry;
				return;
			}
		}
		Debug.logString("conflict resolution queued to: " + reentry);
		this._items.push({download: download, reentry: reentry});
		this._process();
	},
	_check: function CM__check(download) {
		let dest = new FileFactory(download.destinationFile);
		let sn = false;
		if (download.is(RUNNING)) {
			sn = Dialog.checkSameName(download, download.destinationFile);
		}
		Debug.logString("conflict check: " + sn + "/" + dest.exists() + " for " + download.destinationFile);
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
			url: cur.download.urlManager.usable.cropCenter(45),
			fn: cur.download.destinationName.cropCenter(45),
			newDest: cur.newDest.cropCenter(45)
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
		let newDest = new FileFactory(download.destinationFile);
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
		setTimeout(
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
					throw new Components.Exception("Will not execute the file itself");
				}
				arg = download.destinationFile;
			}
			else if (arg in uuids) {
				arg = uuids[arg];
			}
			return arg;
		}
		var args = command
			.replace(/(["'])(.*?)\1/g, callback)
			.split(/ /g)
			.map(mapper);
		var program = new FileFactory(args.shift());
		var process = new Process(program);
		process.run(false, args, args.length);
	}
	catch (ex) {
		Debug.log("failed to execute custom event", ex);
		alert("failed to execute custom event", ex);
	}
	download.complete();
}
