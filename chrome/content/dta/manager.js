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
 * The Initial Developers of the Original Code are Stefano Verna and Federico Parodi
 * Portions created by the Initial Developers are Copyright (C) 2004-2007
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Stefano Verna <stefano.verna@gmail.com>
 *    Federico Parodi <f.parodi@tiscali.it>
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
 
const NS_DTA = 'http://www.downthemall.net/properties#';
const NS_METALINKER = 'http://www.metalinker.org/';
 
 
const NS_ERROR_MODULE_NETWORK = 0x804B0000;
const NS_ERROR_BINDING_ABORTED = NS_ERROR_MODULE_NETWORK + 2;
const NS_ERROR_UNKNOWN_HOST = NS_ERROR_MODULE_NETWORK + 30;
const NS_ERROR_CONNECTION_REFUSED = NS_ERROR_MODULE_NETWORK + 13;
const NS_ERROR_NET_TIMEOUT = NS_ERROR_MODULE_NETWORK + 14;
const NS_ERROR_NET_RESET = NS_ERROR_MODULE_NETWORK + 20;

const Cc = Components.classes;
const Ci = Components.interfaces;

const Exception = Components.Exception;
const Construct = Components.Constructor;
function Serv(c, i) {
	return Cc[c].getService(i ? Ci[i] : null);
}

const BufferedOutputStream = Construct('@mozilla.org/network/buffered-output-stream;1', 'nsIBufferedOutputStream', 'init');
const BinaryOutputStream = Construct('@mozilla.org/binaryoutputstream;1', 'nsIBinaryOutputStream', 'setOutputStream');
const BinaryInputStream = Construct('@mozilla.org/binaryinputstream;1', 'nsIBinaryInputStream', 'setInputStream');
const FileInputStream = Construct('@mozilla.org/network/file-input-stream;1', 'nsIFileInputStream', 'init');
const StringInputStream = Construct('@mozilla.org/io/string-input-stream;1', 'nsIStringInputStream', 'setData');

const ContentHandling = Serv('@downthemall.net/contenthandling;1', 'dtaIContentHandling');
const MimeService = Serv('@mozilla.org/uriloader/external-helper-app-service;1', 'nsIMIMEService');
const ObserverService = Serv('@mozilla.org/observer-service;1', 'nsIObserverService');
const WindowWatcherService = Serv('@mozilla.org/embedcomp/window-watcher;1', 'nsIWindowWatcher');

const MIN_CHUNK_SIZE = 512 * 1024;

// ammount to buffer in BufferedOutputStream
// furthermore up to this ammount will automagically discared after crashes
const CHUNK_BUFFER_SIZE = 96 * 1024;

// in use by chunk.writer...
// in use by decompressor... beware, actual size might be more than twice as big!
const MAX_BUFFER_SIZE = 5 * 1024 * 1024;
const MIN_BUFFER_SIZE = 1 * 1024 * 1024;

const REFRESH_FREQ = 1000;
const REFRESH_NFREQ = 1000 / REFRESH_FREQ;
const STREAMS_FREQ = 200;

var Dialog = {
	_observes: ['quit-application-requested', 'quit-application-granted'],
	_initialized: false,
	_wasRunning: false,
	_lastTime: Utils.getTimestamp(),
	_running: [],
	_autoClears: [],
	completed: 0,
	totalbytes: 0,
	init: function D_init() {
		Tree.init($("downloads"));
		makeObserver(this);
		
		this._observes.forEach(
			function(topic) {
				ObserverService.addObserver(this, topic, true);
			},
			this
		);
	
		document.getElementById("dtaHelp").hidden = !("openHelp" in window);
	
		SessionManager.init();
	
		if ("arguments" in window) {
			startDownloads(window.arguments[0], window.arguments[1]);
		}

		Tree.invalidate();
		this._initialized = true;
		for (let d in Tree.all) {
			if (d.is(FINISHING)) {
				this.run(d);
			}
		}
		this._updTimer = new Timer("Dialog.checkDownloads();", REFRESH_FREQ, true, true);
		new Timer("Dialog.refreshWritten();", 100, true, true);
		new Timer("Dialog.saveRunning();", 10000, true);
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
	},
	refresh: function D_refresh() {
		try {
			let sum = 0;
			const now = Utils.getTimestamp();
			this._running.forEach(
				function(i) {
					let d = i.d;
					
					let advanced = (d.partialSize - i.lastBytes);
					sum += advanced;
					
					let elapsed = (now - i.lastTime) / 1000;					
					if (elapsed < 1) {
						return;
					}						
					
					let speed = Math.round(advanced / elapsed);
					
					i.lastBytes = d.partialSize;
					i.lastTime = now;				

					// Refresh item speed
					d.speeds.push(speed > 0 ? speed : 0);
					if (d.speeds.length > SPEED_COUNT) {
						d.speeds.shift();
					}
					i.lastBytes = d.partialSize;
					i.lastTime = now;
					
					speed = 0;
					d.speeds.forEach(
						function(s) {
							speed += s;
						}
					);
					speed /= d.speeds.length;
					
					// Calculate estimated time					
					if (advanced != 0 && d.totalSize > 0) {
						let remaining = Math.ceil((d.totalSize - d.partialSize) / speed);
						if (!isFinite(remaining)) {
							d.status = _("unknown");
						}
						else {
							d.status = Utils.formatTimeDelta(remaining);
						}
					}
					d.speed = Utils.formatBytes(speed) + "/s";
				}
			);
			let elapsed = (now - this._lastTime) / 1000;
			this._lastTime = now;
			let speed = Math.round(sum * elapsed);
			speed = Utils.formatBytes((speed > 0) ? speed : 0);

			// Refresh status bar
			$("statusText").label = 
				_("cdownloads", [this.completed, Tree.rowCount])
				+ " - "
				+ _("cspeed")
				+ " "
				+ speed + "/s";

			// Refresh window title
			if (this._running.length == 1 && this._running[0].d.totalSize > 0) {
				document.title =
					this._running[0].d.percent
					+ ' - '
					+ this.completed + "/" + Tree.rowCount + " - "
					+ speed + '/s - DownThemAll!';
			}
			else if (this._running.length > 0) {
				document.title =
					Math.floor(this.completed * 100 / Tree.rowCount) + '%'
					+ ' - '				
					+ this.completed + "/" + Tree.rowCount + " - "
					+ speed + '/s - DownThemAll!';
			}
			else {
				document.title = this.completed + "/" + Tree.rowCount + " - DownThemAll!";
			}
		}
		catch(ex) {
			Debug.log("refresh():", ex);
		}
	},
	refreshWritten: function D_checkDownloads() {
		this._running.forEach(
			function(i) {
				i.d.invalidate();
			}
		);
	},
	saveRunning: function D_saveRunning() {
		if (!this._running.length) {
			return;
		}
		SessionManager.beginUpdate();
		this._running.forEach(
			function(i) {
				i.d.save();
			}
		);
		SessionManager.endUpdate();
	},

	checkDownloads: function D_checkDownloads() {
		try {
			this.refresh();
			
			if (Prefs.autoClearComplete && this._autoClears.length) {
				Tree.remove(this._autoClears);
				this._autoClears = [];
			}
			
			if (Prefs.autoRetryInterval) {
				for (let d in Tree.all) {
					d.autoRetry();
				}
			}
					
			this._running.forEach(
				function(i) {
					let d = i.d;
					// checks for timeout
					if (d.is(RUNNING) && (Utils.getTimestamp() - d.timeLastProgress) >= Prefs.timeout * 1000) {
						if (d.resumable || !d.totalSize || !d.partialSize) {
							d.pause();
							d.markAutoRetry();
							d.status = _("timeout");
						}
						else {
							d.cancel(_("timeout"));
						}
						Debug.logString(d + " is a timeout");
					}
				}
			)
			this.startNext();
		}
		catch(ex) {
			Debug.log("checkDownloads():", ex);
		}
	},
	checkSameName: function D_checkSameName(download, path) {
		for (let i = 0; i < this._running.length; ++i) {
			if (this._running[i].d == download) {
				continue;
			}
			if (this._running[i].d.destinationFile == path) {
				return true;
			}
		}
		return false;
	},
	startNext: function D_startNext() {
		try {
			var rv = false;
			for (let d in Tree.all) {
				if (this._running.length >= Prefs.maxInProgress) {
					return rv;
				}				
				if (!d.is(QUEUED)) {
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
	RunningJob: function(d) {
		this.d = d;
		this.lastBytes = d.partialSize;
		this.lastTime = Utils.getTimestamp();
	},
	run: function D_run(download) {
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
		this._running.push(new Dialog.RunningJob(download));
		download.resumeDownload();
	},
	wasStopped: function D_wasStopped(download) {
		this._running = this._running.filter(
			function(i) {
				if (i.d == download) {
					return false;
				}
				return true;
			},
			this
		);
	},
	signal: function D_signal(download) {
		download.save();
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
			if (this.startNext() || Tree.some(function(d) { return d.is(FINISHING, RUNNING, QUEUED); } )) {
				return;
			}
			Debug.logString("signal(): Queue finished");
			Utils.playSound("done");
			
			let dp = Tree.at(0);
			if (dp) {
				dp = dp.destinationPath;
			}
			if (Prefs.alertingSystem == 1) {
				AlertService.show(_("dcom"), _('suc'), dp, dp);
			}
			else if (dp && Prefs.alertingSystem == 0) {
				if (confirm(_('suc') + "\n "+ _("folder")) == 1) {
					try {
						OpenExternal.launch(dp);
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
	_canClose: function D__canClose() {
		if (Tree.some(function(d) { return d.started && !d.resumable && d.is(RUNNING); })) {
			var rv = DTA_confirmYN(
				_("confclose"),
				_("nonres")
			);
			if (rv) {
				return false;
			}
		}
		return (this._forceClose = true);
	},
	close: function D_close() {
		Debug.logString("Close request");
		if (!this._forceClose && !this._canClose()) {
			delete this._forceClose;
			return false;
		}

		// stop everything!
		// enumerate everything we'll have to wait for!
		if (this._updTimer) {
			this._updTimer.kill();
			delete this._updTimer;
		}
		let chunks = 0;
		let finishing = 0;
		Tree.updateAll(
			function(d) {
				if (d.is(RUNNING, QUEUED)) {
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
				}
				else if (d.is(FINISHING)) {
					++finishing;
				}
			},
			this
		);
		if (chunks || finishing) {
			if (this._safeCloseAttempts < 20) {
				++this._safeCloseAttempts;
				new Timer(function() { Dialog.close(); }, 250);				
				return false;
			}
			Debug.logString("Going down even if queue was not probably closed yet!");
		}
		close();
		return true;
	},
	_cleanTmpDir: function D__cleanTmpDir() {
		if (!Prefs.tempLocation || Preferences.getMultiByteDTA("tempLocation", '') != '') {
			// cannot perform this action if we don't use a temp file
			// there might be far too many directories containing far too many tmpFiles.
			// or part files from other users.
			return;
		}
		let known = [];
		for (d in Tree.all) {
			known.push(d.tmpFile.leafName);
		}
		let tmpEnum = Prefs.tempLocation.directoryEntries;
		let unknown = []
		while (tmpEnum.hasMoreElements()) {
			let f = tmpEnum.getNext().QueryInterface(Ci.nsILocalFile);
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
		TimerManager.killAll();
		Prefs.shutdown();
		try {
			this._cleanTmpDir();
		}
		catch(ex) {
			Debug.log("_safeClose", ex);
		}
		SessionManager.shutdown();
		return true;		
	}
};

function UrlManager(urls) {
	this._urls = [];
	this._idx = -1;

	if (urls instanceof Array) {
		this.initByArray(urls);
		this._hasFresh = this._urls.length != 0;
	}
	else if (urls) {
		throw "Feeding the UrlManager with some bad stuff is usually a bad idea!";
	}
}
UrlManager.prototype = {
	_sort: function(a,b) {
		const rv = b.preference - a.preference;
		return rv ? rv : (a.url < b.url ? -1 : 1);
	},
	initByArray: function um_initByArray(urls) {
		for (let i = 0; i < urls.length; ++i) {
			this.add(
				new DTA_URL(
					urls[i].url,
					urls[i].charset,
					urls[i].usable,
					urls[i].preference
				)
			);
		}
		this._urls.sort(this._sort);
		this._usable = this._urls[0].usable;
	},
	add: function um_add(url) {
		if (!url instanceof DTA_URL) {
			throw (url + " is not an DTA_URL");
		}
		if (!this._urls.some(function(ref) { return ref.url == url.url; })) {
			this._urls.push(url);
		}
	},
	getURL: function um_getURL(idx) {
		if (typeof(idx) != 'number') {
			this._idx++;
			if (this._idx >= this._urls.length) {
				this._idx = 0;
			}
			idx = this._idx;
		}
		return this._urls[idx];
	},
	get url() {
		return this._urls[0].url;
	},
	get usable() {
		return this._urls[0].usable;
	},
	get charset() {
		return this._urls[0].charset;
	},
	get length() {
		return this._urls.length;
	},
	get all() {
		for (let i = 0, e = this._urls.length; i < e; ++i) {
			yield this._urls[i];
		}
	},
	markBad: function um_markBad(url) {
		if (this._urls.length > 1) {
			this._urls = this._urls.filter(function(u) { return u != url; });
		}
		else if (this._urls[0] == url) {
			return false;
		}
		return true;
	},
	toSource: function um_toSource() {
		let rv = [];
		this._urls.forEach(
			function(url) {
				rv.push({
					'url': url.url,
					'charset': url.charset,
					'usable': url.usable,
					'preference': url.preference
				});
			}
		);
		return rv;
	},
	toString: function() {
		let rv = '';
		this._urls.forEach(
			function(u) {
				rv += u.preference + " " + u.url + "\n";
			}
		);
		return rv;
	}
};
function Visitor() {
	// sanity check
	if (arguments.length != 1) {
		return;
	}

	var nodes = arguments[0];
	for (x in nodes) {
		if (!name || !(name in this.cmpKeys))	{
			continue;
		}
		this[x] = nodes[x];
	}
}

Visitor.prototype = {
	cmpKeys: {
		'etag': true, // must not be modified from 200 to 206: http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.2.7
		//'content-length': false,
		'content-type': true,
		'last-modified': true, // may get omitted later, but should not change
		'content-encoding': true // must not change, or download will become corrupt.
	},
	type: null,
	overrideCharset: null,
	encoding: null,
	fileName: null,
	acceptRanges: 'bytes',
	contentlength: 0,
	time: null,

	QueryInterface: function(aIID) {
		if (
			aIID.equals(Ci.nsISupports)
			|| aIID.equals(Ci.nsIHttpHeaderVisitor)
		) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	visitHeader: function(aHeader, aValue) {
		try {
			const header = aHeader.toLowerCase();
			switch (header) {
				case 'content-type': {
					this.type = aValue;
					var ch = aValue.match(/charset=['"]?([\w\d_-]+)/i);
					if (ch && ch[1].length) {
						DTA_debug.logString("visitHeader: found override to " + ch[1]);
						this.overrideCharset = ch[1];
					}
				}
				break;

				case 'content-encoding':
					this.encoding = aValue;
				break;

				case 'accept-ranges':
					this.acceptRanges = aValue.toLowerCase().indexOf('none') == -1;
					Debug.logString("acceptrange = " + aValue.toLowerCase());
				break;

				case 'content-length':
					this.contentlength = Number(aValue);
				break;

				case 'content-range': {
					let cl = new Number(aValue.split('/').pop());
					if (cl > 0) {
						this.contentlength = cl;
					}
				}
				break;
				case 'last-modified':
					try {
						this.time = Utils.getTimestamp(aValue);
					}
					catch (ex) {
						Debug.log("gts", ex);
					}
				break;
			}
			if (header == 'etag') {
				// strip off the "inode"-part apache and others produce, as mirrors/caches usually provide different/wrong numbers here :p
				this[header] = aValue
					.replace(/^(?:[Ww]\/)?"(.+)"$/, '$1')
					.replace(/^[a-f\d]+-([a-f\d]+)-([a-f\d]+)$/, '$1-$2')
					.replace(/^([a-f\d]+):[a-f\d]{1,6}$/, '$1');
					Debug.logString("Etag: " + this[header] + " - " + aValue);
			}
			else if (header in this.cmpKeys) {
				this[header] = aValue;
			}
			if ((header == 'content-type' || header == 'content-disposition') && this.fileName == null) {
				// we have to handle headers like "content-disposition: inline; filename='dummy.txt'; title='dummy.txt';"
				var value = aValue.match(/file(?:name)?\s*=\s*(["']?)([^\1;]+)\1(?:;.+)?/i);
				if (!value) {
					// workaround for bug #13959
					// attachments on some vbulletin forums send nasty headers like "content-disposition: inline; filename*=utf-8''file.ext"
					value = aValue.match(/file(?:name)?\*=(.*)''(.+)/i);
					if (value) {
						this.overrideCharset = value[1];
					}
				}
				if (value) {
					this.fileName = value[2].getUsableFileName();
				}
			}
		}
		catch (ex) {
			Debug.log("hrhv::visitHeader:", ex);
		}
	},
	compare: function vi_compare(v)	{
		if (!(v instanceof Visitor)) {
			return;
		}

		for (x in this.cmpKeys) {
			// we don't have this header
			if (!(x in this)) {
				continue;
			}
			// v does not have this header
			else if (!(x in v)) {
				// allowed to be missing?
				if (this.cmpKeys[x]) {
					continue;
				}
				Debug.logString(x + " missing");
				throw new Exception(x + " is missing");
			}
			// header is there, but differs
			else if (this[x] != v[x]) {
				Debug.logString(x + " nm: [" + this[x] + "] [" + v[x] + "]");
				throw new Exception("Header " + x + " doesn't match");
			}
		}
	},
	save: function vi_save(node) {
		var rv = {};
		// salva su file le informazioni sugli headers
		for (x in this.cmpKeys) {
			if (!(x in this)) {
				continue;
			}
			rv[x] = this[x];
		}
		return rv;
	}
};

/**
 * Visitor Manager c'tor
 * @author Nils
 */
function VisitorManager(nodes) {
	this._visitors = {};
	if (nodes) {
		this._load(nodes);
	}
}
VisitorManager.prototype = {
	/**
	 * Loads a ::save'd JS Array
	 * Will silently bypass failed items!
	 * @author Nils
	 */
	_load: function vm_init(nodes) {
		for (let i = 0; i < nodes.length; ++i) {
			try {
				this._visitors[nodes[i].url] = new Visitor(nodes[i].values);
			}
			catch (ex) {
				Debug.log("failed to read one visitor", ex);
			}
		}
	},
	/**
	 * Saves/serializes the Manager and associated Visitors to an JS Array
	 * @return A ::load compatible Array
	 * @author Nils
	 */
	toSource: function vm_toSource() {
		var rv = [];
		for (let x in this._visitors) {
			try {
				var v = {};
				v.url = x;
				v.values = this._visitors[x].save();
				rv.push(v);
			}
			catch(ex) {
				Debug.log(x, ex);
			}
		}
		return rv;
	},
	/**
	 * Visit and compare a channel
	 * @returns visitor for channel
	 * @throws Exception if comparision yield a difference (i.e. channels are not "compatible")
	 * @author Nils
	 */
	visit: function vm_visit(chan) {
		var url = chan.URI.spec;

		var visitor = new Visitor();
		chan.visitResponseHeaders(visitor);
		if (url in this._visitors)
		{
				this._visitors[url].compare(visitor);
		}
		return (this._visitors[url] = visitor);
	},
	/**
	 * return the first timestamp registered with a visitor
	 * @throws Exception if no timestamp found
	 * @author Nils
	 */
	get time() {
		for (let i in this._visitors) {
			if (this._visitors[i].time > 0) {
				return this._visitors[i].time;
			}
		}
		throw new Exception("No Date registered");
	}
};

function QueueItem(lnk, dir, num, desc, mask, referrer, tmpFile) {

	this.visitors = new VisitorManager();

	this.startDate = new Date();	

	this.chunks = [];
	this.speeds = new Array();
	
}

QueueItem.prototype = {
	_state: QUEUED,
	get state() {
		return this._state;
	},
	set state(nv) {
		if (this._state != nv) {
			if (this._state == RUNNING) {
				// remove ourself from inprogresslist
				Dialog.wasStopped(this);
			}
			this._state = nv;
			this.invalidate();
			Tree.refreshTools();
			Dialog.signal(this);
		}
	},
	
	postData: null,
	
	_fileName: null,
	get fileName() {
		return this._fileName;
	},
	set fileName(nv) {
		this._fileName = nv;
		this.rebuildDestination();
		this.invalidate();
		return nv;
	},
	_description: null,
	get description() {
		return this._description;
	},
	set description(nv) {
		this._description = nv;
		this.rebuildDestination();
		this.invalidate();
		return nv;
	},	

	_pathName: null,
	get pathName() {
		return this._pathName;
	},
	set pathName(nv) {
		this._pathName = nv.toString();
		this.rebuildDestination();
		this.invalidate();
		return nv;
	},	

	_mask: null,
	get mask() {
		return this._mask;
	},
	set mask(nv) {
		this._mask = nv;
		this.rebuildDestination();
		this.invalidate();
		return nv;
	},		
	
	_destinationName: null,
	destinationNameOverride: null,
	_destinationNameFull: null,
	get destinationName() {
		return this._destinationNameFull; 
	},
	set destinationName(nv) {
		this.destinationNameOverride = nv;
		this.rebuildDestination();
		this.invalidate();
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
		if (typeof(nv) != 'number') {
			return this._conflicts;
		}
		this._conflicts = nv;
		this.rebuildDestination();
		this.invalidate();
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
			dest.append(name + "-" + newUUIDString() + '.dtapart');
			this._tmpFile = dest;
		}
		return this._tmpFile;
	},
	_hash: null,
	get hash() {
		return this._hash;
	},
	set hash(nv) {
		this._hash = nv;
		this._prettyHash = this.hash ? _('prettyhash', [this.hash.type, this.hash.sum]) : _('nas');
	},
	_prettyHash: null,
	get prettyHash() {
		return this._prettyHash;
	},

	/**
	 *Takes one or more state indicators and returns if this download is in state of any of them
	 */
	is: function QI_is() {
		let state = this.state;
		for (let i = 0, e = arguments.length; i < e; ++i) {
			if (state == arguments[i]) {
				return true;
			}
		}
		return false;
	},
	
	save: function QI_save() {
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
			SessionManager.saveDownload(this.dbId, this.toSource());
			return true;
		}

		this.dbId = SessionManager.addDownload(this.toSource());
		return true;
	},
	remove: function QI_remove() {
		SessionManager.deleteDownload(this.dbId);
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
			SessionManager.savePosition(this.dbId, this._position);	
		}
	},

	contentType: "",
	visitors: null,
	_totalSize: 0,
	get totalSize() { return this._totalSize; },
	set totalSize(nv) {
		this._totalSize = nv;
		this.invalidate();
		return this._totalSize;
	},
	partialSize: 0,

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
		this.invalidate();
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
		this.invalidate();
		Debug.logString("mc set to " + nv);
		return this._maxChunks;
	},
	timeLastProgress: 0,
	timeStart: 0,

	_icon: null,
	get icon() {
		if (!this._icon) {
			this._icon = getIcon(this.destinationName, 'metalink' in this);
		}
		return this._icon;
	},
	get largeIcon() {
		return getIcon(this.destinationName, 'metalink' in this, 32);
	},
	get size() {
		try {
			let file = new FileFactory(this.destinationFile);
			if (file.exists()) {
				return file.fileSize;
			}
		}
		catch (ex) {
			Debug.log("download::getSize(): ", e)
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
		return this._status + (this._autoRetryTime ? ' *' : '');
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
		return Math.floor(this.partialSize / this.totalSize * 100) + "%";
	},
	_destinationPath: '',
	get destinationPath() {
		return this._destinationPath;
	},

	invalidate: function QI_invalidate() {
		Tree.invalidate(this);
	},

	safeRetry: function QI_safeRetry() {
		// reset flags
		this.totalSize = this.partialSize = 0;
		this.compression = null;
		this.activeChunks = this.maxChunks = 0;
		this.chunks.forEach(function(c) { c.cancel(); });
		this.chunks = [];
		this.speeds = [];
		this.visitors = new VisitorManager();
		Dialog.run(this);
	},

	refreshPartialSize: function QI_refreshPartialSize(){
		let size = 0;
		this.chunks.forEach(function(c) { size += c.written; });
		this.partialSize = size;
	},

	pause: function QI_pause(){
		if (this.chunks) {
			for (let i = 0, e = this.chunks.length; i < e; ++i) {
				if (this.chunks[i].running) {
					this.chunks[i].cancel();
				}
			}
		}
		this.activeChunks = 0;
		this.state = PAUSED;
		this.speeds = [];
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
				this.invalidate();
			}
			var df = destination.clone();
			df.append(this.destinationName);
			if (df.exists()) {
				df.remove(false);
			}
			// move file
			if (this.compression) {
				DTA_include("dta/manager/decompressor.js");
				new Decompressor(this);
			}
			else {
				this.tmpFile.clone().moveTo(destination, this.destinationName);
				this.complete();
			}
		}
		catch(ex) {
			Debug.log("continueMoveCompleted encountered an error", ex);
			this.complete(ex);
		}
	},
	handleMetalink: function QI_handleMetaLink() {
		try {
			DTA_include("dta/manager/metalinker.js");
			Metalinker.handleDownload(this);
		}
		catch (ex) {
			Debug.log("handleMetalink", ex);
		}
	},
	verifyHash: function() {
		DTA_include("dta/manager/verificator.js");
		new Verificator(this);
	},
	customFinishEvent: function() {
		DTA_include("dta/manager/customevent.js");
		new CustomEvent(this, Prefs.finishEvent);
	},
	setAttributes: function() {
		if (Prefs.setTime) {
			try {
				var time = this.startDate.getTime();
				try {
					var time =  this.visitors.time;
				}
				catch (ex) {
					// no-op
				}
				// small validation. Around epoche? More than a month in future?
				if (time < 2 || time > Date.now() + 30 * 86400000) {
					throw new Exception("invalid date encountered: " + time + ", will not set it");
				}
				// have to unwrap
				var file = new FileFactory(this.destinationFile);
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
		if (this.hash) {
			this._completeEvents.push('verifyHash');
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
		this.chunks = [];		
		this.activeChunks = 0;
		this.state = COMPLETE;
		this.status = _("complete");
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

			let uripath = uri.path.removeLeadingChar("/");
			if (uripath.length) {
				uripath = uripath.substring(0, uri.path.lastIndexOf("/"))
					.normalizeSlashes()
					.removeFinalSlash();
			}

			let query = '';
			try {
				query = uri.query;
			}
			catch (ex) {
				// no-op
			}

			let description = this.description.removeBadChars().replaceSlashes(' ').trim();
			
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
			let ref = this.referrer ? this.referrer.host.toString() : '';
			
			let curl = (uri.host + ((uripath=="") ? "" : (SYSTEMSLASH + uripath))); 
			
			var replacements = {
				"name": name,
				"ext": ext,
				"text": description,
				"url": host,
				"subdirs": uripath,
				"flatsubdirs": uripath.replaceSlashes('-'),
				"refer": ref,
				"qstring": query,
				"curl": curl,
				"flatcurl": curl.replaceSlashes('-'),
				"num": Utils.formatNumber(this.numIstance),
				"hh": Utils.formatNumber(this.startDate.getHours(), 2),
				"mm": Utils.formatNumber(this.startDate.getMinutes(), 2),
				"ss": Utils.formatNumber(this.startDate.getSeconds(), 2),
				"d": Utils.formatNumber(this.startDate.getDate(), 2),
				"m": Utils.formatNumber(this.startDate.getMonth() + 1, 2),
				"y": String(this.startDate.getFullYear())
			}
			function replacer(type) {
				var t = type.substr(1, type.length - 2);
				if (t in replacements) {
					return replacements[t];
				}
				return type;
			}
			
			mask = mask.replace(/\*\w+\*/gi, replacer);

			mask = mask.removeBadChars().removeFinalChar(".").trim().split(SYSTEMSLASH);
			let file = new FileFactory(this.pathName.addFinalSlash());
			while (mask.length) {
				file.append(mask.shift());
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

	fail: function QI_fail(title, msg, state) {
		Debug.logString("failDownload invoked");

		this.cancel(state);

		Utils.playSound("error");

		switch (Prefs.alertingSystem) {
			case 1:
				AlertService.show(title, msg, false);
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

			this.visitors = new VisitorManager();

			if (message == "" || !message) {
				message = _("canceled");
			}
			this.status = message;


			this.removeTmpFile();

			// gc
			this.chunks = [];
			this.totalSize = this.partialSize = 0;
			this.maxChunks = this.activeChunks = 0;
			this.conflicts = 0;
			this.resumable = true;
			this._autoRetries = 0;
			delete this._autoRetryTime;

		} catch(ex) {
			Debug.log("cancel():", ex);
		}
	},
	
	removeTmpFile: function QI_removeTmpFile() {
		if (!this.tmpFile.exists()) {
			return;
		}
		try {
			this.tmpFile.remove(false);
		}
		catch (ex) {
			Debug.log("failed to remove tmpfile: " + this.tmpFile.path, ex);
		}
	},
	sessionConnections: 0,
	_autoRetries: 0,
	_autoRetryTime: 0,
	markAutoRetry: function QI_markRetry() {
		if (!Prefs.autoRetryInterval || (Prefs.maxAutoRetries && Prefs.maxAutoRetries <= this._autoRetries)) {
			 return;
		}
		this._autoRetryTime = Utils.getTimestamp();
		Debug.logString("marked auto-retry: " + d);
	},
	autoRetry: function QI_autoRetry() {
		if (!this._autoRetryTime || Utils.getTimestamp() - (Prefs.autoRetryInterval * 1000) < this._autoRetryTime) {
			return;
		}

		this._autoRetryTime = 0;
		++this._autoRetries;
		this.queue();
		Debug.logString("Requeued due to auto-retry: " + d);		
	},
	queue: function QI_queue() {
		this._autoRetryTime = 0;
		this.state = QUEUED;
		this.status = _("inqueue");
	},
	resumeDownload: function QI_resumeDownload() {
		Debug.logString("resumeDownload: " + this);
		function cleanChunks(d) {
			// merge finished chunks together, so that the scoreboard does not bloat that much
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
			Debug.logString("started: " + chunk);
			download.chunks.push(chunk);
			download.chunks.sort(function(a,b) { return a.start - b.start; });
			downloadChunk(download, chunk, header);
			download.sessionConnctions = 0;	
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
			if (this.maxChunks <= this.activeChunks) {
				return false;
			}

			var rv = false;

			// we didn't load up anything so let's start the main chunk (which will grab the info)
			if (this.chunks.length == 0) {
				downloadNewChunk(this, 0, 0, true);
				return false;
			}

			// start some new chunks
			var paused = this.chunks.filter(
				function (chunk) {
					return !(chunk.running || chunk.complete);
				}
			);
			while (this.activeChunks < this.maxChunks) {

				// restart paused chunks
				if (paused.length) {
					downloadChunk(this, paused.shift());
					rv = true;
					continue;
				}
				
				// find biggest chunk
				let biggest = null;
				this.chunks.forEach(
					function (chunk) {
						if (chunk.running && chunk.remainder > MIN_CHUNK_SIZE * 2) {
							if (!biggest || biggest.remainder < chunk.remainder) {
								biggest = chunk;
							}
						}
					}
				);

				// nothing found, break
				if (!biggest) {
					break;
				}
				var end = biggest.end;
				var bend = biggest.start + biggest.written + Math.floor(biggest.remainder / 2);
				biggest.end = bend;
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
	dumpScoreboard: function QI_dumpScoreboard() {
		let scoreboard = '';
		let len = String(this.totalSize).length; 
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
	toString: function() {
		return this.urlManager.usable;
	},
	toSource: function() {
		let e = {};
		[
			'fileName',
			'postData',
			'numIstance',
			'description',
			'resumable',
			'mask',
			'pathName',
			'compression',
			'maxChunks',
			'contentType',
			'conflicts',
		].forEach(
			function(u) {
				e[u] = this[u];
			},
			this
		);
		if (this.hash) {
			e.hash = _atos(this.hash.sum);
			e.hashType = _atos(this.hash.type);
		}
		e.state = this.is(COMPLETE, CANCELED, FINISHING) ? this.state : PAUSED;
		if (this.destinationNameOverride) {
			this.destinationName = this.destinationNameOverride;
		}
		if (this.referrer) {
			e.referrer = this.referrer.spec;
		}
		// Store this so we can later resume.
		if (!this.is(CANCELED, COMPLETE) && this.partialSize) {
			e.tmpFile = this.tmpFile.path;
		}
		e.startDate = this.startDate.getTime();

		e.urlManager = this.urlManager.toSource();
		e.visitors = this.visitors.toSource();

		if (!this.resumable && !this.is(COMPLETE)) {
			e.totalSize = 0;
		}
		else {
			e.totalSize = this.totalSize;
		}
		
		e.chunks = [];

		if (this.is(RUNNING, PAUSED, QUEUED) && this.resumable) {
			this.chunks.forEach(
				function(c) {
					e.chunks.push({start: c.start, end: c.end, written: c.safeBytes});
				}
			);
		}
		return Serializer.encode(e);
	}
}

function Chunk(download, start, end, written) {
	// saveguard against null or strings and such
	this._written = written > 0 ? written : 0;
	this._buffered = 0;
	this._start = start;
	this._end = end;
	this.end = end;
	this._parent = download;
	this._sessionbytes = 0;
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
	merge: function CH_merge(ch) {
		if (!this.complete && !ch.complete) {
			throw new Error("Cannot merge incomplete chunks this way!");
		}
		this.end = ch.end;
		this._written += ch._written;
	},
	open: function CH_open() {
		this._sessionBytes = 0;
		let file = this.parent.tmpFile.clone();
		if (!file.parent.exists()) {
			file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, Prefs.dirPermissions);
			this.parent.invalidate();
		}
		let prealloc = !file.exists();
		if (prealloc && this.parent.totalSize > 0) {
			try {
				file.create(file.NORMAL_FILE_TYPE, Prefs.permissions);
				file.fileSize = this.parent.totalSize;
				Debug.logString("fileSize set using #1");
				prealloc = false;
			}
			catch (ex) {
				// no op
			}
		}		
		let outStream = new FileOutputStream(file, 0x02 | 0x08, Prefs.permissions, 0);
		let seekable = outStream.QueryInterface(Ci.nsISeekableStream);
		if (prealloc && this.parent.totalSize > 0) {
			try {
				seekable.seek(0x00, this.parent.totalSize);
				seekable.setEOF();
				Debug.logString("fileSize set using #2");
			}
			catch (ex) {
				// no-op
			}
		}
		seekable.seek(0x00, this.start + this.written);
		this._outStream = new BufferedOutputStream(outStream, CHUNK_BUFFER_SIZE);
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
	_written: 0,
	_outStream: null,
	write: function CH_write(aInputStream, aCount) {
		try {
			if (!this._outStream) {
				this.open();
			}
			bytes = this.remainder;
			if (!this.total || aCount < bytes) {
				bytes = aCount;
			}
			if (!bytes) {
				return 0;
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
			this._buffered = Math.min(CHUNK_BUFFER_SIZE, this._buffered + bytes);

			this.parent.timeLastProgress = Utils.getTimestamp();

			return bytes;
		}
		catch (ex) {
			Debug.log('write: ' + this.parent.tmpFile.path, ex);
			throw ex;
		}
		return 0;
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
			+ " written/remain:"
			+ Utils.formatNumber(this.written, len)
			+ "/"
			+ Utils.formatNumber(this.remainder, len);
	}
}

var Prompts = {
	_authPrompter: null,
	_prompter: null,
	get authPrompter() {
		if (!this._authPrompter) {
			this._authPrompter = WindowWatcherService.getNewAuthPrompter(window)
				.QueryInterface(Ci.nsIAuthPrompt);		
		}
		return this._authPrompter;
	},
	get prompter() {
		if (!this._prompter) {
			this._prompter = WindowWatcherService.getNewPrompter(window)
				.QueryInterface(Ci.nsIPrompt);
		}
		return this._prompter;
	}
};

function Connection(d, c, getInfo) {

	this.d = d;
	this.c = c;
	this.isInfoGetter = getInfo;
	this.url = d.urlManager.getURL();
	var referrer = d.referrer;
	Debug.logString("starting: " + this.url.url);

	this._chan = IOService.newChannelFromURI(this.url.url.toURL());
	var r = Ci.nsIRequest;
	this._chan.loadFlags = r.LOAD_NORMAL | r.LOAD_BYPASS_CACHE;
	this._chan.notificationCallbacks = this;
	try {
		var encodedChannel = this._chan.QueryInterface(Ci.nsIEncodedChannel);
		encodedChannel.applyConversion = false;
	}
	catch (ex) {
		// no-op
	}
	try {
		let http = this._chan.QueryInterface(Ci.nsIHttpChannel);
		if (c.start + c.written > 0) {
			http.setRequestHeader('Range', 'bytes=' + (c.start + c.written) + "-", false);
		}
		if (referrer instanceof Ci.nsIURI) {
			http.referrer = referrer;
		}
		http.setRequestHeader('Keep-Alive', '', false);
		http.setRequestHeader('Connection', 'close', false);
		if (d.postData) {
			let uc = http.QueryInterface(Ci.nsIUploadChannel);
			uc.setUploadStream(new StringInputStream(d.postData, d.postData.length), null, -1);
			http.requestMethod = 'POST';
		}			 
	}
	catch (ex) {
		Debug.log("error setting up channel", ex);
		// no-op
	}
	this.c.running = true;
	this._chan.asyncOpen(this, null);
}

Connection.prototype = {
	_interfaces: [
		Ci.nsISupports,
		Ci.nsISupportsWeakReference,
		Ci.nsIWeakReference,
		Ci.nsICancelable,
		Ci.nsIInterfaceRequestor,
		Ci.nsIStreamListener,
		Ci.nsIRequestObserver,
		Ci.nsIProgressEventSink,
		Ci.nsIChannelEventSink,
		Ci.nsIFTPEventSink,
	],
	
	cantCount: false,

	QueryInterface: function DL_QI(iid) {
		if (this._interfaces.some(function(i) { return iid.equals(i); })) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	// nsISupportsWeakReference
	GetWeakReference: function DL_GWR() {
		return this;
	},
	// nsIWeakReference
	QueryReferent: function DL_QR(uuid) {
		return this.QueryInterface(uuid);
	},
	// nsICancelable
	cancel: function DL_cancel(aReason) {
		try {
			if (this._closed) {
				return;
			}
			Debug.logString("cancel");
			if (!aReason) {
				aReason = NS_ERROR_BINDING_ABORTED;
			}
			this._chan.cancel(aReason);
			this._closed = true;
		}
		catch (ex) {
			Debug.log("cancel", ex);
		}
	},
	// nsIInterfaceRequestor
	getInterface: function DL_getInterface(iid) {
		if (iid.equals(Ci.nsIAuthPrompt)) {
			return Prompts.authPrompter;
		}
		if (iid.equals(Ci.nsIPrompt)) {
			return Prompts.prompter;
		}
		// for 1.9
		/* this one makes minefield ask for the password again and again :p
		if ('nsIAuthPromptProvider' in Ci && iid.equals(Ci.nsIAuthPromptProvider)) {
			return Prompts.prompter.QueryInterface(Ci.nsIAuthPromptProvider);
		}*/
		// for 1.9
		if ('nsIAuthPrompt2' in Ci && iid.equals(Ci.nsIAuthPrompt2)) {
			return Prompts.authPrompter.QueryInterface(Ci.nsIAuthPrompt2);
		}
		try {
			return this.QueryInterface(iid);
		}
		catch (ex) {
			Debug.log("interface not implemented: " + iid, ex);
			throw ex;
		}
	},

	// nsIChannelEventSink
	onChannelRedirect: function DL_onChannelRedirect(oldChannel, newChannel, flags) {
		if (!this.isInfoGetter) {
			return;
		}
		try {
			this._chan == newChannel;
			this.url.url = newChannel.URI.spec;
			this.d.fileName = this.url.usable.getUsableFileName();
		}
		catch (ex) {
			// no-op
		}
	},
	
	// nsIStreamListener
  onDataAvailable: function DL_onDataAvailable(aRequest, aContext, aInputStream, aOffset, aCount) {
		if (this._closed) {
			throw 0x804b0002; // NS_BINDING_ABORTED;
		}
		try {
			// we want to kill ftp chans as well which do not seem to respond to cancel correctly.
			if (!this.c.write(aInputStream, aCount)) {
				// we already got what we wanted
				this.cancel();
			}
		}
		catch (ex) {
			Debug.log('onDataAvailable', ex);
			this.d.fail(_("accesserror"), _("permissions") + " " + _("destpath") + ". " + _("checkperm"), _("accesserror"));
		}
	},
	
	// nsIFTPEventSink
	OnFTPControlLog: function(server, msg) {},
	
	handleError: function DL_handleError() {
		let c = this.c;
		let d = this.d;
		
		c.cancel();
		d.dumpScoreboard();
		if (d.chunks.indexOf(c) == -1) {
			// already killed;
			return true;
		}

		Debug.logString("handleError: problem found; trying to recover");
		
		if (d.urlManager.markBad(this.url)) {
			Debug.logString("handleError: fresh urls available, kill this one and use another!");
			d.timeLastProgress = Utils.getTimestamp();
			return true;
		}
		
		Debug.logString("affected: " + c);
		
		let max = -1, found = -1;
		for (let i = 0; i < d.chunks.length; ++i) {
			let cmp = d.chunks[i]; 
			if (cmp.start < c.start && cmp.start > max) {
				found = i;
				max = cmp.start;
			}
		}
		if (found > -1) {
			Debug.logString("handleError: found joinable chunk; recovering suceeded, chunk: " + found);
			d.chunks[found].end = c.end;
			if (--d.maxChunks == 1) {
				//d.resumable = false;
			}
			d.chunks = d.chunks.filter(function(ch) { return ch != c; });
			d.chunks.sort(function(a,b) { return a.start - b.start; });
			
			// check for overlapping ranges we might have created
			// otherwise we'll receive a size mismatch
			// this means that we're gonna redownload an already finished chunk...
			for (let i = d.chunks.length - 2; i > -1; --i) {
				let c1 = d.chunks[i], c2 = d.chunks[i + 1];
				if (c1.end >= c2.end) {
					if (c2.running) {
						// should never ever happen :p
						d.dumpScoreboard();
						Debug.logString("overlapping:\n" + c1 + "\n" + c2);
						d.fail("Internal error", "Please notify the developers that there were 'overlapping chunks'!", "Internal error (please report)");
						return false;
					}
					d.chunks.splice(i + 1, 1);
				}
			}
			let ac = 0;
			d.chunks.forEach(function(c) { if (c.running) { ++ac;	}});
			d.activeChunks = ac;
			c.close();
			
			d.save();
			d.dumpScoreboard();
			return true;
		}
		return false;
	},
	handleHttp: function DL_handleHttp(aChannel) {
		let c = this.c;
		let d = this.d;
		
		let code = 0, status = 'Server returned nothing';
		try {
			code = aChannel.responseStatus;
			status = aChannel.responseStatusText;
		}
		catch (ex) {
			return true;
		}
		 
		if (code >= 400) {
			if (!this.handleError()) {
				Debug.log("handleError: Cannot recover from problem!", code);
				if ([401, 402, 407, 500, 502, 503, 504].indexOf(code) != -1) {
					Debug.log("we got temp failure!", code);
					d.pause();
					d.markAutoRetry();
					d.status = code >= 500 ? _('temperror') : _('autherror');
				}
				else if (code == 450) {
					d.fail(
						_('pcerrortitle'),
						_('pcerrortext'),
						_('pcerrortitle')
					);
				}
				else {
					var file = d.fileName.length > 50 ? d.fileName.substring(0, 50) + "..." : d.fileName;
					code = Utils.formatNumber(code, 3);
					d.fail(
						_("error", [code]),
						_("failed", [file]) + " " + _("sra", [code]) + ": " + status,
						_("error", [code])
					);
				}
				// any data that we got over this channel should be considered "corrupt"
				c.rollback();
				d.save();
			}
			return false;
		}

		// not partial content altough we are multi-chunk
		if (code != 206 && !this.isInfoGetter) {
			Debug.log(d + ": Server returned a " + aChannel.responseStatus + " response instead of 206", this.isInfoGetter);
			
			d.resumable = false;

			if (!this.handleError()) {
				vis = {value: '', visitHeader: function(a,b) { this.value += a + ': ' + b + "\n"; }};
				aChannel.visitRequestHeaders(vis);
				Debug.logString("Request Headers\n\n" + vis.value);
				vis.value = '';
				aChannel.visitResponseHeaders(vis);
				Debug.logString("Response Headers\n\n" + vis.value);
				d.cancel();
				d.resumable = false;
				d.safeRetry();
				return false;
			}
		}

		var visitor = null;
		try {
			visitor = d.visitors.visit(aChannel);
		}
		catch (ex) {
			Debug.log("header failed! " + d, ex);
			// restart download from the beginning
			d.cancel();
			d.resumable = false;
			d.safeRetry();
			return false;
		}
		
		if (!this.isInfoGetter) {
			return false;
		}

		if (visitor.type) {
			d.contentType = visitor.type;
		}

		// compression?
		if (['gzip', 'deflate'].indexOf(visitor.encoding) != -1 && !d.contentType.match(/gzip/i) && !d.fileName.match(/\.gz$/i)) {
			d.compression = visitor.encoding;
		}
		else {
			d.compression = null;
		}

		// accept range
		d.resumable &= visitor.acceptRanges;

		if (visitor.type && visitor.type.search(/application\/metalink\+xml/) != -1) {
			d.isMetalink = true;
			d.resumable = false;
		}

		if (visitor.contentlength > 0) {
			d.totalSize = visitor.contentlength;
		} else {
			d.totalSize = 0;
		}
		
		if (visitor.fileName && visitor.fileName.length > 0) {
			// if content disposition hasn't an extension we use extension of URL
			let newName = visitor.fileName;
			let ext = this.url.usable.getExtension();
			if (visitor.fileName.lastIndexOf('.') == -1 && ext) {
				newName += '.' + ext;
			}
			let charset = visitor.overrideCharset ? visitor.overrideCharset : this.url.charset;
			d.fileName = DTA_URLhelpers.decodeCharset(newName, charset).getUsableFileName();
		}

		return false;
	},
	
	// Generic handler for now :p
	handleFtp: function  DL_handleFtp(aChannel) {
		return this.handleGeneric(aChannel);
	},
	
	handleGeneric: function DL_handleGeneric(aChannel) {
		var c = this.c;
		var d = this.d;
		
		// hack: determine if we are a multi-part chunk,
		// if so something bad happened, 'cause we aren't supposed to be multi-part
		if (c.start != 0 && d.is(RUNNING)) {
			if (!this.handleError()) {
				Debug.log(d + ": Server error or disconnection", "(type 1)");
				d.status = _("servererror");
				d.markAutoRetry();
				d.pause();
			}
			return false;
		}			
			
		// try to get the size anyway ;)
		try {
			let pb = aChannel.QueryInterface(Ci.nsIPropertyBag2);
			d.totalSize = Math.max(pb.getPropertyAsInt64('content-length'), 0);
		}
		catch (ex) {
			try {
				d.totalSize = Math.max(aChannel.contentLength, 0);
			}
			catch (ex) {
				d.totalSize = 0;
			}
		}
		d.resumable = false;
		return false;
	},
	
	//nsIRequestObserver,
	_supportedChannels: [
		{i:Ci.nsIHttpChannel, f:'handleHttp'},
		{i:Ci.nsIFTPChannel, f:'handleFtp'},
		{i:Ci.nsIChannel, f:'handleGeneric'}
	],
	onStartRequest: function DL_onStartRequest(aRequest, aContext) {
		let c = this.c;
		let d = this.d;
		Debug.logString('StartRequest: ' + c);
	
		this.started = true;
		try {
			for (let i = 0, e = this._supportedChannels.length; i < e; ++i) {
				let sc = this._supportedChannels[i];
				let chan = null;
				try {
					chan = aRequest.QueryInterface(sc.i);
				}
				catch (ex) {
					continue;
				}
				if (chan) {
					if ((this.rexamine = this[sc.f](chan))) {
						 return;
					}
					break;
				}					
			}

			if (this.isInfoGetter) {
				// Checks for available disk space.
				
				if (d.fileName.getExtension() == 'metalink') {
					d.isMetalink = true;
					d.resumable = true;
				}				
				
				var tsd = d.totalSize;
				try {
					if (tsd) {
						let tmp = Prefs.tempLocation, vtmp = 0;
						if (tmp) {
							vtmp = Utils.validateDir(tmp);
							if (!vtmp && Utils.getFreeDisk(vtmp) < tsd) {
								d.fail(_("ndsa"), _("spacetemp"), _("freespace"));
								return;
							}
						}
						let realDest = Utils.validateDir(d.destinationPath);
						if (!realDest) {
							throw new Error("invalid destination folder");
						}
						var nsd = Utils.getFreeDisk(realDest);
						// Same save path or same disk (we assume that tmp.avail == dst.avail means same disk)
						// simply moving should succeed
						if (d.compression && (!tmp || Utils.getFreeDisk(vtmp) == nsd)) {
							// we cannot know how much space we will consume after decompressing.
							// so we assume factor 1.0 for the compressed and factor 1.5 for the decompressed file.
							tsd *= 2.5;
						}
						if (nsd < tsd) {
							Debug.logString("nsd: " +  nsd + ", tsd: " + tsd);
							d.fail(_("ndsa"), _("spacedir"), _("freespace"));
							return;
						}
					}
				}
				catch (ex) {
					Debug.log("size check threw", ex);
					d.fail(_("accesserror"), _("permissions") + " " + _("destpath") + ". " + _("checkperm"), _("accesserror"));
					return;
				}
				
				if (!d.totalSize) {
					d.resumable = false;					
					this.cantCount = true;
				}
				if (!d.resumable) {
					d.maxChunks = 1;
				}
				c.end = d.totalSize - 1;
				delete this.isInfoGetter;
				
				// Explicitly trigger rebuildDestination here, as we might have received
				// a html content type and need to rewrite the file
				d.rebuildDestination();
				ConflictManager.resolve(d);
			}
			
			if (d.resumable && !d.is(CANCELED)) {
				d.resumeDownload();
			}
		}
		catch (ex) {
			Debug.log("onStartRequest", ex);
		}
	},
	onStopRequest: function DL_onStopRequest(aRequest, aContext, aStatusCode) {
		try {
			Debug.logString('StopRequest');
		}
		catch (ex) {
			return;
		}
		
		// shortcuts
		let c = this.c;
		let d = this.d;
		c.close();
		
		if (d.chunks.indexOf(c) == -1) {
			return;
		}

		// update flags and counters
		d.refreshPartialSize();
		--d.activeChunks;

		// check if we're complete now
		if (d.is(RUNNING) && d.chunks.every(function(e) { return e.complete; })) {
			if (!d.resumeDownload()) {
				d.state = FINISHING;
				Debug.logString(d + ": Download is complete!");
				d.finishDownload();
				return;
			}
		}

		if (c.starter && -1 != [
			NS_ERROR_CONNECTION_REFUSED,
			NS_ERROR_UNKNOWN_HOST,
			NS_ERROR_NET_TIMEOUT,
			NS_ERROR_NET_RESET
		].indexOf(aStatusCode)) {
			Debug.log(d + ": Server error or disconnection", "(type 3)");
			d.pause();
			d.status = _("servererror");
			d.markAutoRetry();				
			return;
		}		

		// routine for normal chunk
		Debug.logString(d + ": Chunk " + c.start + "-" + c.end + " finished.");
		
		// rude way to determine disconnection: if connection is closed before download is started we assume a server error/disconnection
		if (c.starter && d.is(RUNNING)) {
			if (!d.urlManager.markBad(this.url)) {
				Debug.log(d + ": Server error or disconnection", "(type 2)");
				d.pause();
				d.status = _("servererror");
				d.markAutoRetry();				
			}
			else {
				Debug.log("caught bad server", d.toString());
				d.cancel();
				d.safeRetry();
			}
			return;			
		}

		if (!d.is(PAUSED, CANCELED, FINISHING) && d.chunks.length == 1 && d.chunks[0] == c) {
			if (d.resumable) {
				d.pause();
				d.markAutoRetry();
				d.status = _('errmismatchtitle');
			}
			else {
				d.fail(
					_('errmismatchtitle'),
					_('errmismatchtext', [d.partialSize, d.totalSize]),
					_('errmismatchtitle')
				);
			}
			return;			
		}
		if (!d.is(PAUSED, CANCELED)) {
			d.resumeDownload();
		}
	},

	// nsIProgressEventSink
  onProgress: function DL_onProgress(aRequest, aContext, aProgress, aProgressMax) {
		try {
			// shortcuts
			let c = this.c;
			let d = this.d;
			
			if (this.reexamine) {
				Debug.logString(d + ": reexamine");
				this.onStartRequest(aRequest, aContext);
				if (this.reexamine) {
					return;
				}
			}

			// update download tree row
			if (d.is(RUNNING)) {
				d.refreshPartialSize();

				if (!this.resumable && d.totalSize) {
					// basic integrity check
					if (d.partialSize > d.totalSize) {
						d.dumpScoreboard();
						Debug.logString(d + ": partialSize > totalSize" + "(" + d.partialSize + "/" + d.totalSize + "/" + ( d.partialSize - d.totalSize) + ")");
						d.fail(
							_('errmismatchtitle'),
							_('errmismatchtext', [d.partialSize, d.totalSize]),
							_('errmismatchtitle')
						);
						return;
					}
				}
				else {
					d.status = _("downloading");
				}
			}
		}
		catch(ex) {
			Debug.log("onProgressChange():", e);
		}
	},
	onStatus: function  DL_onStatus(aRequest, aContext, aStatus, aStatusArg) {}
};

function startDownloads(start, downloads) {

	var numbefore = Tree.rowCount - 1;
	const DESCS = ['description', 'ultDescription'];
	
	let g = downloads;
	if ('length' in downloads) {
		g = function() {
			 for (let i = 0, e = downloads.length; i < e; ++i) {
			 	yield downloads[i];
			 }
		}();
	}

	let added = 0;
	let removeableTabs = {};
	Tree.beginUpdate();
	SessionManager.beginUpdate();
	for (let e in g) {

		var desc = "";
		DESCS.some(
			function(i) {
				if (typeof(e[i]) == 'string' && e[i].length) {
					desc = e.description;
					return true;
				}
				return false;
			}
		);
		
		let qi = new QueueItem();
		let lnk = e.url;
		if (typeof lnk == 'string') {
			qi.urlManager = new UrlManager([new DTA_URL(lnk)]);
		}
		else if (lnk instanceof UrlManager) {
			qi.urlManager = lnk;
		}
		else {
			qi.urlManager = new UrlManager([lnk]);
		}
		qi.numIstance = e.numIstance;
	
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
		qi._description = desc ? desc : '';
		qi._mask = e.mask;
		if (e.fileName) {
			qi.fileName = e.fileName;
		}
		else {
			qi.fileName = qi.urlManager.usable.getUsableFileName();
		}
		if (e.startDate) {
			qi.startDate = e.startDate;
		}
		if (e.url.hash) {
			qi.hash = e.url.hash;
		}
		else if (e.hash) {
			qi.hash = e.hash;
		}
		else {
			qi.hash = null; // to initialize prettyHash 
		}

		let postData = ContentHandling.getPostDataFor(qi.urlManager.url.toURI());
		if (e.url.postData) {
			postData = e.url.postData;
		}
		if (postData) {
			qi.postData = postData;
		}		

		qi.state = start ? QUEUED : PAUSED;
		if (qi.is(QUEUED)) {
			qi.status = _('inqueue');
		}
		else {
			qi.status = _('paused');
		}
		qi.save();		
		Tree.add(qi);
		++added;
	}
	SessionManager.endUpdate();
	Tree.endUpdate();

	var boxobject = Tree._box;
	boxobject.QueryInterface(Ci.nsITreeBoxObject);
	if (added <= boxobject.getPageLength()) {
		boxobject.scrollToRow(Tree.rowCount - boxobject.getPageLength());
	}
	else {
		boxobject.scrollToRow(numbefore);
	}
}
const FileOutputStream = Components.Constructor(
	'@mozilla.org/network/file-output-stream;1',
	'nsIFileOutputStream',
	'init'
);

var ConflictManager = {
	_items: [],
	resolve: function CM_resolve(download, reentry) {
		if (!this._check(download)) {
			if (reentry) {
				download[reentry]();
			}
			return;
		}
		for (let i = 0; i < this._items.length; ++i) {
			if (this._items[i].download == download) {
				Debug.logString("conflict resolution updated to: " + reentry);
				
				this._items[i].reentry = reentry;
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
				if (reentry) {
					cur.download[reentry]();
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
			Preferences.setDTA('conflictresolution', option);
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

var Serializer = {
	encode: function(obj) {
		if ('nsIJSON' in Ci) {
			Debug.logString("hello json");
			let json = Serv('@mozilla.org/dom/json;1', 'nsIJSON');
			this.encode = function(obj) {
				return json.encode(obj);
			}
		}
		else {
			this.encode = function(obj) {
				return obj.toSource();
			}
		}
		return this.encode(obj);
	},
	decode: function(str) {
		if ('nsIJSON' in Ci) {
			Debug.logString("hello json");
			let json = Serv('@mozilla.org/dom/json;1', 'nsIJSON');
			this.decode = function(str) {
				try {
					return json.decode(str);
				}
				catch (ex) {
					return eval(str);
				}
			}
		}
		else {
			this.decode = function(str) {
				return eval(str);
			}
		}
		return this.decode(str);
	}
};
