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
 *    Federico Parodi
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

if (!Cc) {
	var Cc = Components.classes;
}
if (!Ci) {
	var Ci = Components.interfaces;
}

const MIN_CHUNK_SIZE = 700 * 1024;
// in use by chunk.writer...
// in use by decompressor... beware, actual size might be more than twice as big!
const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 3 MB
const MIN_BUFFER_SIZE = 1 * 1024 * 1024; // 1 MB
const SPEED_COUNT = 25;

const REFRESH_FREQ = 1000;
const REFRESH_NFREQ = 1000 / REFRESH_FREQ;
const STREAMS_FREQ = 100;

var Dialog = {
	_lastSum: 0,
	_initialized: false,
	_wasRunning: false,
	completed: 0,
	totalbytes: 0,
	init: function D_init() {
		make_();
		Tree.init($("downloads"));
	
		document.getElementById("dtaHelp").hidden = !("openHelp" in window);
	
		SessionManager.init();
	
		if ("arguments" in window) {
			startnewDownloads(window.arguments[0], window.arguments[1]);
		}

		Tree.invalidate();
		Dialog.checkDownloads();
		this._initialized = true;
	},	
	refresh: function D_refresh() {
		try {
			var sum = 0;
			const now = Utils.getTimestamp();
			inProgressList.forEach(
				function(i) {
					var d = i.d;
					if (d.partialSize != 0 && d.is(RUNNING) && (now - d.timeStart) >= 1000 ) {
						// Calculate estimated time
						if (d.totalSize > 0) {
							var remaining = Math.ceil((d.totalSize - d.partialSize) / ((d.partialSize - i.lastBytes) * REFRESH_NFREQ));
							if (!isFinite(remaining)) {
								d.status = _("unknown");
							}
							else {
								d.status = Utils.formatTimeDelta(remaining);
							}
						}
					}
					let speed = Math.round((d.partialSize - i.lastBytes) * REFRESH_NFREQ);

					// Refresh item speed
					d.speed = Utils.formatBytes(speed) + "/s";
					d.speeds.push(speed > 0 ? speed : 0);
					if (d.speeds.length > SPEED_COUNT) {
						d.speeds.shift();
					}
					sum += (i.lastBytes = d.partialSize);
					SessionManager.save(d);
				}
			);
			let speed = Math.round((sum - this._lastSum) * REFRESH_NFREQ);
			speed = (speed > 0) ? speed : 0;
			this._lastSum = sum;

			// Refresh status bar
			$("statusText").label = 
				_("cdownloads", [this.completed, Tree.rowCount])
				+ " - "
				+ _("cspeed")
				+ " "
				+ Utils.formatBytes(speed) + "/s";

			// Refresh window title
			if (inProgressList.length == 1 && inProgressList[0].d.totalSize > 0) {
				document.title =
					Math.round(inProgressList[0].d.partialSize / inProgressList[0].d.totalSize * 100) + "% - "
					+ this.completed + "/" + Tree.rowCount + " - "
					+ Utils.formatBytes(speed) + "/s - DownThemAll! - " + _("dip");
			}
			else if (inProgressList.length > 0) {
				document.title =
					this.completed + "/" + Tree.rowCount + " - "
					+ Utils.formatBytes(speed) + "/s - DownThemAll! - " + _("dip");
			}
			else {
				document.title = this.completed + "/" + Tree.rowCount + " - DownThemAll!";
			}
		}
		catch(ex) {
			Debug.dump("refresh():", ex);
		}
	},

	checkDownloads: function D_checkDownloads() {
		try {
			this.refresh();
		
			inProgressList.forEach(
				function(i) {
					var d = i.d;
					// checks for timeout
					if (d.is(RUNNING) && (Utils.getTimestamp() - d.timeLastProgress) >= Prefs.timeout * 1000) {
						if (d.isResumable) {
							d.pause();
							d.status = _("timeout");
						}
						else {
							d.cancel(_("timeout"));
						}
						Debug.dump(d + " is a timeout");
					}
				}
			)
			this.startNext();
			Dialog.setTimer('dialog:checkDownloads', "Dialog.checkDownloads();", REFRESH_FREQ);
		} catch(ex) {
			Debug.dump("checkDownloads():", ex);
		}
	},
	startNext: function D_startNext() {
		try {
			var rv = false;
			for (let d in Tree.all) {
				if (inProgressList.length >= Prefs.maxInProgress) {
					return rv;
				}				
				if (!d.is(QUEUED)) {
					continue;
				}
				d.status = _("starting");
		
				d.timeLastProgress = Utils.getTimestamp();
				d.state = RUNNING;
		
				if (inProgressList.indexOf(d) == -1) {
					inProgressList.push(new inProgressElement(d));
					d.timeStart = Utils.getTimestamp();
				}
		
				if (!d.isStarted) {
					d.isStarted = true;
					Debug.dump("Let's start " + d);
				} else {
					Debug.dump("Let's resume " + d + " at " + d.partialSize);
				}
				d.resumeDownload();
				rv = true;
			}
			return rv;
		} catch(ex){
			Debug.dump("startNext():", ex);
		}
		return false;
	},
	signal: function D_signal(download) {
		if (download.is(RUNNING)) {
			this._wasRunning = true;
		}
		if (!this._initialized || !this._wasRunning || !download.is(COMPLETE)) {
			return;
		}
		try {
			// check if there is something running or scheduled
			if (this.startNext() || Tree.some(function(d) { return d.is(FINISHING, RUNNING, QUEUED); } )) {
				return;
			}
			Debug.dump("signal(): Queue finished");
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

			SessionManager.save();
			if (Prefs.autoClose) {
				Dialog.close();
			}
		}
		catch(ex) {
			Debug.dump("signal():", ex);
		}
	},
	close: function D_close() {
		
		// Check for non-resumable downloads
		if (Tree.some(function(d) { return d.isStarted && !d.isResumable && d.is(RUNNING); })) {
			var promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"]
				.getService(Ci.nsIPromptService);
			var rv = promptService.confirm(
				window,
				_("confclose"),
				_("nonres")
			);
			if (!rv) {
				return false;
			}
		}
		// stop everything!
		// enumerate everything we'll have to wait for!
		this.killTimer('dialog:checkDownloads');
		this._safeCloseChunks = [];
		this._safeCloseFinishing = []
		for (d in Tree.all) {
			if (d.is(RUNNING, QUEUED)) {
				// enumerate all running chunks
				d.chunks.forEach(
					function(c) {
						if (c.isRunning) {
							this._safeCloseChunks.push(c);
						}
					},
					this
				);
				d.pause();				
			}
			else if (d.is(FINISHING)) {
				this._safeCloseFinishing.push(d);
			}
		}
		return this._safeClose();
	},
	_safeCloseChunks: [],
	// this one will loop until all chunks and FINISHING are gone.
	_safeClose: function D__safeClose() {
		// cannot close at this point
		this._safeCloseChunks = this._safeCloseChunks.filter(function(c) { return c.isRunning; });
		this._safeCloseFinishing = this._safeCloseFinishing.filter(function(d) { return d.is(FINISHING); });
		if (this._safeCloseChunks.length || this._safeCloseFinishing.length) {
			this.setTimer('_safeClose', "Dialog._safeClose();", 250);
			return false;
		}
		this._killTimers();
		// alright, we left the loop.. shutdown complete ;)
		SessionManager.save();
		self.close();
		return true;		
	},
	_timers: {},
	setTimer: function D_setTimer(id, func, interval) {
		this._timers[id] = window.setTimeout(func, interval);
	},
	killTimer: function D_killTimer(id) {
		if (id in this._timers) {
			window.clearTimeout(this._timers[id]);
			delete this._timers[id];
		}
	},
	_killTimers: function D__killTimers() {
		for (id in this._timers) {
			window.clearTimeout(this._timers[id]);
		}
		this._timers = {};
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
		throw "Feeding the URLManager with some bad stuff is usually a bad idea!";
	}
}
UrlManager.prototype = {
	_sort: function(a,b) {
		const rv = b.preference - a.preference;
		return rv ? rv : (a.url < b.url ? -1 : 1);
	},
	initByArray: function um_initByArray(urls) {
		for (var i = 0; i < urls.length; ++i) {
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
	markBad: function um_markBad(url) {
		if (this._urls.length > 1) {
			this._urls = this._urls.filter(function(u) { return u != url; });
		}
		else if (this._urls[0] == url) {
			return false;
		}
		return true;
	},
	save: function um_save() {
		var rv = [];
		for (var i = 0, e = this._urls.length; i < e; ++i) {
			var c = {};
			c.url = this._urls[i].url;
			c.charset = this._urls[i].charset;
			c.usable = this._urls[i].usable;
			c.preference = this._urls[i].preference;
			rv.push(c);
		}
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
						DTA_debug.dump("visitHeader: found override to " + ch[1]);
						this.overrideCharset = ch[1];
					}
				}
				break;

				case 'content-encoding':
					this.encoding = aValue;
				break;

				case 'accept-ranges':
					this.acceptRanges = aValue.toLowerCase().indexOf('none') == -1;
					Debug.dump("acceptrange = " + aValue.toLowerCase());
				break;

				case 'content-length':
					this.contentlength = Number(aValue);
				break;

				case 'content-range':
					// XXX?
					var dim = aValue.substring(aValue.lastIndexOf('/') + 1, aValue.length);
					if (dim.length>0 && dim.lastIndexOf('*')==-1) {
						this.contentlength = Number(dim);
					}
				break;
				case 'last-modified':
					try {
						this.time = Utils.getTimestamp(aValue);
					}
					catch (ex) {
						Debug.dump("gts", ex);
						// no-op
					}
				break;
			}
			if (header == 'etag') {
				// strip off the "inode"-part apache and others produce, as mirrors/caches usually provide wrong numbers here :p
				this[header] = aValue.replace(/^[a-f\d]+-([a-f\d]+)-([a-f\d]+)$/, '$1-$2');
			}
			else if (header in this.cmpKeys) {
				this[header] = aValue;
			}
			if ((header == 'content-type' || header == 'content-disposition') && this.fileName == null) {
				// we have to handle headers like "content-disposition: inline; filename='dummy.txt'; title='dummy.txt';"
				var value = aValue.match(/file(?:name)?=(["']?)([^\1;]+)\1(?:;.+)?/i);
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
		} catch (ex) {
			Debug.dump("hrhv::visitHeader:", ex);
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
				Debug.dump(x + " missing");
				throw new Components.Exception(x + " is missing");
			}
			// header is there, but differs
			else if (this[x] != v[x]) {
				Debug.dump(x + " nm: [" + this[x] + "] [" + v[x] + "]");
				throw new Components.Exception("Header " + x + " doesn't match");
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
function VisitorManager() {
	this._visitors = {};
}
VisitorManager.prototype = {
	/**
	 * Loads a ::save'd JS Array
	 * Will silently bypass failed items!
	 * @author Nils
	 */
	load: function vm_init(nodes) {
		for (var i = 0; i < nodes.length; ++i) {
			try {
				this._visitors[nodes[i].url] = new Visitor(nodes[i].values);
			} catch (ex) {
				Debug.dump("failed to read one visitor", ex);
			}
		}
	},
	/**
	 * Saves/serializes the Manager and associated Visitors to an JS Array
	 * @return A ::load compatible Array
	 * @author Nils
	 */
	save: function vm_save() {
		var rv = [];
		for (x in this._visitors) {
			try {
				var v = {};
				v.url = x;
				v.values = this._visitors[x].save();
				rv.push(v);
			} catch(ex) {
				Debug.dump(x, ex);
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
		for (i in this._visitors) {
			if (this._visitors[i].time > 0) {
				return this._visitors[i].time;
			}
		}
		throw new Components.Exception("No Date registered");
	}
};

function QueueItem(lnk, dir, num, desc, mask, referrer, tmpFile) {

	this.visitors = new VisitorManager();

	dir = dir.addFinalSlash();

	if (typeof lnk == 'string') {
		this.urlManager = new UrlManager([new DTA_URL(lnk)]);
	}
	else if (lnk instanceof UrlManager) {
		this.urlManager = lnk;
	}
	else {
		this.urlManager = new UrlManager([lnk]);
	}

	this.startDate = new Date();	
	this.numIstance = num;
	this.description = desc ? desc : '';
	this.chunks = [];
	this.speeds = new Array();
	if (referrer) {
		this.referrer = IOService.newURI(referrer, null, null);
	}

	// only access the setter of the last so that we don't generate stuff trice.
	this._pathName = dir;
	this._mask = mask;
	this.fileName = this.urlManager.usable.getUsableFileName();
	
	
	// XXX: reset ranges when failed.
	if (tmpFile) {
		try {
			tmpFile = new FileFactory(tmpFile);
			if (tmpFile.exists()) {
				this._tmpFile = tmpFile;
			}
			else {
				// Download partfile is gone!
				// XXX find appropriate error message!
				this.fail(_("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
			}
		}
		catch (ex) {
			Debug.dump("tried to construct with invalid tmpFile", ex);
		}
	}
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
				for (let i = 0, e = inProgressList.length; i < e; ++i) {
					if (this == inProgressList[i].d) {
						inProgressList.splice(i, 1);
						break;
					}
				}				
			}
			this._state = nv;
			this.invalidate();
			Tree.refreshTools();
			Dialog.signal(this);
		}
	},
	
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

	_pathName: null,
	get pathName() {
		return this._pathName;
	},
	set pathName(nv) {
		this._pathName = nv;
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
	get destinationName() {
		return this.destinationNameOverride ? this.destinationNameOverride : this._destinationName; 
	},
	set destinationName(nv) {
		this.destinationNameOverride = nv;
		this._destinationFile = this.destinationPath + this.destinationName;
		this.invalidate();
		return nv;
	},
	
	_destinationFile: null,
	get destinationFile() {
		return this._destinationFile;
	},

	_tmpFile: null,
	get tmpFile() {
		if (!this._tmpFile) {
			var dest = Prefs.tempLocation
				? Prefs.tempLocation.clone()
				: new FileFactory(this.parent.destinationPath);
			let name = this.fileName;
			if (name.length > 60) {
				name = name.substring(1, 60);
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

	isResumable: false,
	isStarted: false,

	_activeChunks: 0,
	get activeChunks() {
		return this._activeChunks;
	},
	set activeChunks(nv) {
		this._activeChunks = nv;
		this.invalidate();
		return this._activeChunks;
	},
	_maxChunks: 0,
	get maxChunks() {
		return this._maxChunks;
	},
	set maxChunks(nv) {
		this._maxChunks = nv;
		this.invalidate();
		Debug.dump("mc set to", nv);
		return this._maxChunks;
	},
	timeLastProgress: 0,
	timeStart: 0,

	_icon: null,
	get icon() {
		if (!this._icon) {
			this._icon = getIcon(this.fileName, 'metalink' in this);
		}
		return this._icon;
	},
	get largeIcon() {
		return getIcon(this.fileName, 'metalink' in this, 32);
	},
	get size() {
		try {
			let file = new FileFactory(this.destinationFile);
			if (file.exists()) {
				return file.fileSize;
			}
		}
		catch (ex) {
			Debug.dump("download::getSize(): ", e)
		}
		return 0;
	},
	get dimensionString() {
		if (this.partialSize <= 0) {
			return _('unknown'); 
		}
		else if (this.totalSize <= 0) {
			return Utils.formatBytes(this.partialSize) + "/" + _('nas');
		}
		return Utils.formatBytes(this.partialSize) + "/" + Utils.formatBytes(this.totalSize);
	},
	_status : '',
	get status() {
		return this._status;
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

	_hasToBeRedownloaded: false,
	get hasToBeRedownloaded() {
		return this._hasToBeRedownloaded;
	},
	set hasToBeRedownloaded(nv) {
		Debug.dump("HR: " + this._hasToBeRedownloaded + "/" + nv);
		return this._hasToBeRedownloaded = nv;
	},
	reDownload: function QI_reDownload() {
		// reset flags
		this.pause();
		this.totalSize = this.partialSize = 0;
		this.compression = null;
		this.activeChunks = 0;
		this.maxChunks = 0;
		this.chunks = [];
		this.visitors = new VisitorManager();
		this.resumeDownload();
	},

	refreshPartialSize: function QI_refreshPartialSize(){
		var size = 0;
		this.chunks.forEach(function(c) { size += c.written; });
		this.partialSize = size;
	},

	pause: function QI_pause(){
		if (this.chunks) {
			for (let i = 0, e = this.chunks.length; i < e; ++i) {
				if (this.chunks[i].isRunning) {
					this.chunks[i].download.cancel();
					this.chunks[i].close();
				}
			}
		}
		this.state = PAUSED;
	},

	moveCompleted: function QI_moveCompleted() {
		if (this.is(CANCELED)) {
			return;
		}

		try {
			if (!this.checkNameConflict()) {
				return;
			}
			// safeguard against some failed chunks.
			this.chunks.forEach(function(c) { c.close(); });
			var destination = new FileFactory(this.destinationPath);
			Debug.dump(this.fileName + ": Move " + this.tmpFile.path + " to " + this.destinationFile);

			if (!destination.exists()) {
				destination.create(Ci.nsIFile.DIRECTORY_TYPE, 0766);
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
			Debug.dump(ex);
			this.complete(ex);
		}
	},
	handleMetalink: function QI_handleMetaLink() {
		try {
			DTA_include("dta/manager/metalinker.js");
			Metalinker.handleDownload(this);
		}
		catch (ex) {
			Debug.dump("handleMetalink", ex);
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
					throw new Components.Exception("invalid date encountered: " + time + ", will not set it");
				}
				// have to unwrap
				var file = new FileFactory(this.destinationFile);
				file.lastModifiedTime = time;
			}
			catch (ex) {
				Debug.dump("Setting timestamp on file failed: ", ex);
			}
		}
		this.totalSize = this.partialSize = this.size;
		++Dialog.completed;
		
		this.complete();
	},
	finishDownload: function QI_finishDownload(exception) {
		Debug.dump("finishDownload, connections", this.sessionConnections);
		this._completeEvents = ['moveCompleted'];
		if (this.hash) {
			this._completeEvents.push('verifyHash');
		}
		if ('isMetalink' in this) {
			this._completeEvents.push('handleMetalink');
		}
		this._completeEvents.push('setAttributes');
		if (Prefs.finishEvent) {
			this._completeEvents.push('customFinishEvent');
		}
		this.complete();
	},
	_completeEvents: [],
	complete: function QI_complete(exception) {
		if (exception) {
			this.fail(_("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
			Debug.dump("complete: ", exception);
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
						Debug.dump("completeEvent failed: " + evt, ex);
						tp.complete();
					}
				},
				0
			);
			return;
		}
		this.state = COMPLETE;
		this.status = _("complete");
		this.chunks = [];		
		SessionManager.save(this);
	},
	rebuildDestination: function QI_rebuildDestination() {
		try {
			var url = this.urlManager.usable;
			var uri = IOService.newURI(url, null, null).QueryInterface(Ci.nsIURL);

			// normalize slashes
			var mask = this.mask
				.removeLeadingChar("\\").removeFinalChar("\\")
				.removeLeadingChar("/").removeFinalChar("/")
				.replace(/([\\/]{1,})/g, SYSTEMSLASH);

			var uripath = uri.path.removeLeadingBackSlash();
			if (uripath.length) {
				uripath = uripath.substring(0, uri.path.lastIndexOf("/"))
					.removeFinalBackSlash()
					.replace(/\//g, SYSTEMSLASH);
			}

			var query = '';
			try {
				query = uri.query;
			}
			catch (ex) {
				// no-op
			}

			this.description = this.description.removeBadChars().replace(/[\\/]/g, "").trim();

			var name = this.fileName;
			var ext = name.getExtension();
			if (ext) {
				name = name.substring(0, this.fileName.lastIndexOf("."));

				if (this.contentType && /html?/.test(this.contentType) && !/htm/.test(ext)) {
					ext += ".html";
				}
			}
			// mime-service method
			else if (this.contentType) {
				try {
					var info = Cc["@mozilla.org/uriloader/external-helper-app-service;1"]
						.getService(Ci.nsIMIMEService)
						.getFromTypeAndExtension(this.contentType.split(';')[0], "");
					ext = info.primaryExtension;
				} catch (ex) {
					ext = '';
				}
			}
			else {
				name = this.fileName;
				ext = '';
			}
			
			var replacements = {
				"name": name,
				"ext": ext,
				"text": this.description,
				"url": uri.host,
				"subdirs": uripath,
				"refer": this.referrer.host,
				"qstring": query,
				"curl": (uri.host + ((uripath=="")?"":(SYSTEMSLASH + uripath))),
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

			mask = this.pathName.addFinalSlash() + mask.removeBadChars().removeFinalChar(".").trim();
			mask = mask.split(SYSTEMSLASH);
			this._destinationName = mask.pop();
			this._destinationPath = mask.join(SYSTEMSLASH).addFinalSlash();
		}
		catch(ex) {
			this._destinationName = this.fileName;
			this._destinationPath = this.pathName.addFinalSlash();
			Debug.dump("buildFromMask():", ex);
		}
		this._destinationFile = this.destinationPath + this.destinationName;
		this._icon = null;
		this.checkNameConflict();		
	},

	checkNameConflict: function  QI_checkFileNameConflict() {

		function askForRenaming(t, s1, s2, s3) {
			if (Prefs.onConflictingFilenames == 3) {
				if (Prefs.askEveryTime) {
					var passingArguments = new Object();
					passingArguments.text = t;
					passingArguments.s1 = s1;
					passingArguments.s2 = s2;
					passingArguments.s3 = s3;
		
					window.openDialog(
						"chrome://dta/content/dta/dialog.xul","_blank","chrome,centerscreen,resizable=no,dialog,modal,close=no,dependent",
						passingArguments
					);
		
					// non faccio registrare il timeout
					inProgressList.forEach(function(o) { o.d.timeLastProgress = Utils.getTimestamp(); });
		
					Prefs.askEveryTime = (passingArguments.temp == 0) ? true : false;
					Prefs.sessionPreference = passingArguments.scelta;
				}
				return Prefs.sessionPreference;
			}
			return Prefs.onConflictingFilenames;
		}
		
		let dn = this._destinationName, ds = this._destinationPath, df = this._destinationFile;
		let dest = new FileFactory(this.destinationFile), newDest = new FileFactory(df);
		if (!this.is(RUNNING, FINISHING) || !dest.exists()) {
			return true;
		}
			
		let basename = dn, ext = '', pos = basename.lastIndexOf('.');
		if (pos != -1) {
			ext = basename.slice(pos);
			basename = basename.slice(0, pos);
		}
		for (let i = 1;; ++i) {
			newDest.leafName = basename + "_" +  Utils.formatNumber(i) + ext;
			if (!newDest.exists()) {
				break;
			}
		}
		newDest = newDest.leafName;

		var shortUrl = this.urlManager.usable.cropCenter(70);

		function mc(aCaption, aValue) {
			return {caption: aCaption, value: aValue};
		}

		var s = -1, p;
		s = askForRenaming(
			_('alreadyexists', [dn, ds]) + " " + _('whatdoyouwith', [shortUrl]),
			mc(_('reninto', [newDest]), 0),
			mc(_('overwrite'), 1),
			mc(_('skip'), 2)
		);
		
		switch (s) {
			case 0:	this.destinationName = newDest; return true;
			case 1: return true;
			case 3: inProgressList[p].d.cancel(); return true;
			default: this.cancel(_('skipped')); return false;
		}
	},

	fail: function QI_fail(title, msg, state) {
		Debug.dump("failDownload invoked");

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
			Debug.dump(this.fileName + ": canceled");

			this.visitors = new VisitorManager();

			if (message == "" || !message) {
				message = _("canceled");
			}
			this.status = message;

			if (this.is(COMPLETE)) {
				Dialog.completed--;
			}
			else if (this.is(RUNNING)) {
				this.pause();
			}
			this.removeTmpFile();
			this.state = CANCELED;

			// gc
			this.chunks = [];
			this.totalSize = this.partialSize = 0;

		} catch(ex) {
			Debug.dump("cancel():", ex);
		}
	},
	
	removeTmpFile: function QI_removeTmpFile() {
		if (this.tmpFile.exists()) {
			try {
				this.tmpFile.remove(false);
			}
			catch (ex) {
				// no-op
			}
		}
	},
	sessionConnections: 0,
	resumeDownload: function QI_resumeDownload() {
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
			download.chunks.push(chunk);
			download.chunks.sort(function(a,b) { return a.start - b.start; });
			downloadChunk(download, chunk, header);
			download.sessionConnctions = 0;	
		}
		function downloadChunk(download, chunk, header) {
			chunk.isRunning = true;
			download.state = RUNNING;
			//download.checkNameConflict();
			chunk.download = new Download(download, chunk, header);
			++download.activeChunks;
			++download.sessionConnections;
		}
		
		cleanChunks(this);

		try {
			if (!this.maxChunks) {
				this.maxChunks = Prefs.maxChunks;
			}
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
					return !chunk.isRunning && !chunk.complete;
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
						if (chunk.isRunning && chunk.remainder > MIN_CHUNK_SIZE * 2) {
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
			Debug.dump("resumeDownload():", ex);
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
		Debug.dump("scoreboard\n" + scoreboard);
	},	
	toString: function() {
		return this.urlManager.usable;
	}
}

function inProgressElement(el) {
	this.d = el;
	this.lastBytes = el.partialSize;
}

var inProgressList = [];

var Chunk = function(download, start, end, written) {
	// saveguard against null or strings and such
	this._written = written > 0 ? written : 0;
	this._start = start;
	this._end = end;
	this.end = end;
	this._parent = download;
}

Chunk.prototype = {
	isRunning: false,
	get isStarter() {
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
		var file = this.parent.tmpFile;
		if (!file.parent.exists()) {
			file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0700);
		}
		var prealloc = !file.exists();
		var outStream = new FileOutputStream(file, 0x04 | 0x08, 0766, 0);
		let seekable = outStream.QueryInterface(Ci.nsISeekableStream);
		if (prealloc && this.parent.totalSize > 0) {
			try {
				seekable.seek(0x00, this.parent.totalSize);
				seekable.setEOF();
			}
			catch (ex) {
				// no-op
			}
		}
		seekable.seek(0x00, this.start + this.written);
		this._outStream = outStream;
	},
	close: function CH_close() {
		this.isRunning = false;
		if (this._outStream) {
			this._outStream.flush();
			this._outStream.close();
			delete this._outStream;
		}
		if (this.parent.is(CANCELED)) {
			this.parent.removeTmpFile();
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
				throw new Components.Exception("bytes negative");
			}
			// need to wrap this as nsIInputStream::read is marked non-scriptable.
			var byteStream = Cc['@mozilla.org/binaryinputstream;1']
				.createInstance(Ci.nsIBinaryInputStream);
			byteStream.setInputStream(aInputStream);
			// we're using nsIFileOutputStream
			if (this._outStream.write(byteStream.readBytes(bytes), bytes) != bytes) {
				throw ("chunks::write: read/write count mismatch!");
			}
			this._written += bytes;

			this.parent.timeLastProgress = Utils.getTimestamp();
			this.parent.invalidate();

			return bytes;
		} catch (ex) {
			Debug.dump('write:', ex);
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
			+ this.isRunning
			+ " written/remain:"
			+ Utils.formatNumber(this.written, len)
			+ "/"
			+ Utils.formatNumber(this.remainder, len);
	}
}

function Download(d, c, getInfo) {

	this.d = d;
	this.c = c;
	this.isInfoGetter = getInfo;
	this.url = d.urlManager.getURL();
	var referrer = d.referrer;

	this._chan = IOService.newChannelFromURI(IOService.newURI(this.url.url, null, null));
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
		var http = this._chan.QueryInterface(Ci.nsIHttpChannel);
		if (c.start + c.written > 0) {
			http.setRequestHeader('Range', 'bytes=' + (c.start + c.written) + "-", false);
		}
		if (referrer instanceof Ci.nsIURI) {
			http.referrer = referrer;
		}
		http.setRequestHeader('Keep-Alive', '', false);
		http.setRequestHeader('Connection', 'close', false);
	}
	catch (ex) {

	}
	this.c.isRunning = true;
	this._chan.asyncOpen(this, null);
}
Download.prototype = {
	_interfaces: [
		Ci.nsISupports,
		Ci.nsISupportsWeakReference,
		Ci.nsIWeakReference,
		Ci.nsICancelable,
		Ci.nsIInterfaceRequestor,
		Ci.nsIAuthPrompt,
		Ci.nsIStreamListener,
		Ci.nsIRequestObserver,
		Ci.nsIProgressEventSink,
		Ci.nsIChannelEventSink,
		Ci.nsIFTPEventSink
	],
	
	_redirectedTo: null,

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
			Debug.dump("cancel");
			if (!aReason) {
				aReason = 0x804b0002; // NS_BINDING_ABORTED;
			}
			this._chan.cancel(aReason);
			this._closed = true;
		} catch (ex) {
			Debug.dump("cancel", ex);
		}
	},
	// nsIInterfaceRequestor
	getInterface: function DL_getInterface(iid) {
		try {
			return this.QueryInterface(iid);
		}
		catch (ex) {
			throw ex;
		}
	},
	get authPrompter() {
		try {
			var watcher = Cc["@mozilla.org/embedcomp/window-watcher;1"]
				.getService(Ci.nsIWindowWatcher);
			var rv = watcher.getNewAuthPrompter(null)
				.QueryInterface(Ci.nsIAuthPrompt);
			return rv;
		} catch (ex) {
			Debug.dump("authPrompter", ex);
			throw ex;
		}
	},
	// nsIAuthPrompt
	prompt: function DL_prompt(aDialogTitle, aText, aPasswordRealm, aSavePassword, aDefaultText, aResult) {
		return this.authPrompter.prompt(
			aDialogTitle,
			aText,
			aPasswordRealm,
			aSavePassword,
			aDefaultText,
			aResult
		);
	},

	promptUsernameAndPassword: function DL_promptUaP(aDialogTitle, aText, aPasswordRealm, aSavePassword, aUser, aPwd) {
		return this.authPrompter.promptUsernameAndPassword(
			aDialogTitle,
			aText,
			aPasswordRealm,
			aSavePassword,
			aUser,
			aPwd
		);
	},
	promptPassword: function DL_promptPassword(aDialogTitle, aText, aPasswordRealm, aSavePassword, aPwd) {
		return this.authPrompter.promptPassword(
			aDialogTitle,
			aText,
			aPasswordRealm,
			aSavePassword,
			aPwd
		);
	},
	
	// nsIChannelEventSink
	onChannelRedirect: function DL_onChannelRedirect(oldChannel, newChannel, flags) {
		try {
			this._chan == newChannel;
			this._redirectedTo = newChannel.URI.spec;
			this.url.url = this._redirectedTo;
			this.d.filename = this.url.usable.getUsableFileName();
		}
		catch (ex) {
			// no-op
		}
	},
	
	// nsIFtpEventSink - to keep interfacerequestor calm ;)
	OnFTPControlLog: function DL_OnFTPControlLog(fromServer, msg) {
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
			Debug.dump('onDataAvailable', ex);
			this.d.fail(_("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
		}
	},

	handleError: function DL_handleError() {
		var c = this.c;
		var d = this.d;

		Debug.dump("handleError: problem found; trying to recover");
		
		if (d.urlManager.markBad(this.url)) {
			Debug.dump("handleError: fresh urls available, kill this one and use another!");
			this.cancel();
			return true;
		}
		
		d.dumpScoreboard();
		
		let max = -1, found = -1;
		for (let i = 0; i < d.chunks.length; ++i) {
			let cmp = d.chunks[i]; 
			if (cmp.isRunning && cmp.start < c.start && cmp.start > max) {
				found = i;
				max = cmp.start;
			}
		}
		if (found > -1) {
			Debug.dump("handleError: found joinable chunk; recovering suceeded", found);
			d.chunks[found].end = c.end;
			if (--d.maxChunks == 1) {
				d.isResumable = false;
			}
			this.cancel();
			d.chunks = d.chunks.filter(function(ch) { return ch != c; });
			d.chunks.sort(function(a,b) { return a.start - b.start; });
			
			// check for overlapping ranges we might have created
			// otherwise we'll receive a size mismatch
			// this means that we're gonna redownload an already finished chunk...
			//    XXX
			//  yyyyyyy
			for (let i = d.chunks.length - 2; i > -1; --i) {
				let c1 = d.chunks[i], c2 = d.chunks[i + 1];
				if (c1.end >= c2.end) {
					if (c2.isRunning) {
						// should never ever happen :p
						d.fail("Internal error", "Please notify the developers that there were 'overlapping chunks'!", "Internal error (please report)");
						return false;
					}
					d.chunks.splice(i + 1, 1);				
				}
			}
			c.close();
			
			SessionManager.save(d);
			d.dumpScoreboard();			
			return true;
		}
		return false;
	},
	
	handleHttp: function DL_handleHttp(aChannel) {
		var c = this.c;
		var d = this.d;
		
		let code = 0, status = 'Server returned nothing';
		try {
			code = aChannel.responseStatus;
			status = aChannel.responseStatusText;
		}
		catch (ex) {
			// no-op
		}
		
		if (!code || code >= 400) {
			if (!this.handleError()) {
				Debug.dump("handleError: Cannot recover from problem!", code);
				var file = d.fileName.length > 50 ? d.fileName.substring(0, 50) + "..." : d.fileName;
				code = Utils.formatNumber(code, 3);
				d.fail(
					_("error", [code]),
					_("failed", [file]) + " " + _("sra", [code]) + ": " + status,
					_("error", [code])
				);
				SessionManager.save(d);
			}
			return;
		}

		// not partial content altough we are multi-chunk
		if (aChannel.responseStatus != 206 && c.start + c.written != 0) {
			Debug.dump(d + ": Server returned a " + aChannel.responseStatus + " response instead of 206... Normal mode");
			Debug.dump(c, this.url.url);

			if (!this.handleError()) {
				vis = {value: '', visitHeader: function(a,b) { this.value += a + ': ' + b + "\n"; }};
				aChannel.visitRequestHeaders(vis);
				Debug.dump("Request Headers\n\n" + vis.value);
				vis.value = '';
				aChannel.visitResponseHeaders(vis);
				Debug.dump("Response Headers\n\n" + vis.value);
				d.hasToBeRedownloaded = true;
				d.reDownload();
				return;
			}
		}

		var visitor = null;
		try {
			visitor = d.visitors.visit(aChannel);
		}
		catch (ex) {
			Debug.dump("header failed! " + d, ex);
			// restart download from the beginning
			d.hasToBeRedownloaded = true;
			d.reDownload();
			return;
		}
		
		if (!this.isInfoGetter) {
			return;
		}

		if (visitor.type) {
			d.contentType = visitor.type;
		}

		// compression?
		if (['gzip', 'deflate'].indexOf(visitor.encoding) != -1 && !d.contentType.match(/gzip/i) && !d.fileName.match(/\.gz$/i)) {
			d.compression = visitor.encoding;
		}

		// accept range
		d.isResumable = visitor.acceptRanges;

		if (visitor.type && visitor.type.search(/application\/metalink\+xml/) != -1) {
			Debug.dump(d + " is a metalink");
			d.isMetalink = true;
			d.isResumable = false;
		}

		if (visitor.contentlength > 0) {
			d.totalSize = visitor.contentlength;
		} else {
			d.totalSize = 0;
		}
		
		var newName;
		if (visitor.fileName && visitor.fileName.length > 0) {
			// if content disposition hasn't an extension we use extension of URL
			newName = visitor.fileName;
			let ext = this.url.usable.getExtension();
			if (visitor.fileName.lastIndexOf('.') == -1 && ext) {
				newName += '.' + ext;
			}
		} else if (this._redirectedTo) {
			// if there has been one or more "moved content" header directives, we use the new url to create filename
			newName = this._redirectedTo;
		}

		// got a new name, so decode and set it.
		if (newName) {
			let charset = visitor.overrideCharset ? visitor.overrideCharset : this.url.charset;
			newName = DTA_URLhelpers.decodeCharset(newName, charset);
			d.fileName = newName.getUsableFileName();
		}
	},
	
	// Generic handler for now :p
	handleFtp: function  DL_handleFtp(aChannel) {
		return this.handleGeneric(aChannel, aContext);
	},
	
	handleGeneric: function DL_handleGeneric(aChannel) {
		var c = this.c;
		var d = this.d;
		
		// hack: determine if we are a multi-part chunk,
		// if so something bad happened, 'cause we aren't supposed to be multi-part
		if (c.start != 0) {
			if (!this.handleError()) {
				Debug.dump(d + ": Server error or disconnection (type 1)");
				d.status = _("srver");
				d.speed = '';
				d.pause();
			}
			return;
		}
		
		if (this._redirectedTo) {
			let url = new DTA_URL(this._redirectedTo, this.url.charset);
			d.fileName = url.usable.getUsableFileName();
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
		d.isResumable = false;
	},
	
	//nsIRequestObserver,
	_supportedChannels: [
		{i:Ci.nsIHttpChannel, f:'handleHttp'},
		{i:Ci.nsIFtpChannel, f:'handleFtp'},
		{i:Ci.nsIChannel, f:'handleGeneric'}
	],
	onStartRequest: function DL_onStartRequest(aRequest, aContext) {
		Debug.dump('StartRequest');
		var c = this.c;
		var d = this.d;
	
		this.started = true;
		try {
			for (let i = 0, e = this._supportedChannels.length; i < e; ++i) {
				let sc = this._supportedChannels[i];
				let chan = null;
				try {
					chan = aRequest.QueryInterface(sc.i);
				}
				catch (ex) {
					continue
				}
				if (chan) {
					this[sc.f](chan);
					break;
				}					
			}

			if (this.isInfoGetter) {
				// Checks for available disk space.
				
				var tsd = d.totalSize;
				try {
					if (tsd) {
						let tmp = Prefs.tempLocation, vtmp = 0;
						if (tmp) {
							vtmp = Utils.validateDir(tmp);
							if (!vtmp && vtmp.diskSpaceAvailable < tsd) {
								d.fail(_("ndsa"), _("spacetemp"), _("freespace"));
								return;
							}
						}
						let realDest = Utils.validateDir(d.destinationPath);
						if (!realDest) {
							throw new Error("invalid destination folder");
						}
						var nsd = realDest.diskSpaceAvailable;
						// Same save path or same disk (we assume that tmp.avail == dst.avail means same disk)
						// simply moving should succeed
						if (d.compression && (!tmp || vtmp.diskSpaceAvailable == nsd)) {
							// we cannot know how much space we will consume after decompressing.
							// so we assume factor 1.0 for the compressed and factor 1.5 for the decompressed file.
							tsd *= 2.5;
						}
						if (nsd < tsd) {
							d.fail(_("ndsa"), _("spacedir"), _("freespace"));
							return;
						}
					}
				}
				catch (ex) {
					Debug.dump("size check threw", ex);
					d.fail(_("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
					return;
				}
				
				// if we are redownloading the file, here we can force single chunk mode
				if (d.hasToBeRedownloaded) {
					d.hasToBeRedownloaded = null;
					d.isResumable = false;
				}
	
				if (!d.totalSize) {
					d.isResumable = false;					
					this.cantCount = true;
				}
				if (!d.isResumable) {
					d.maxChunks = 1;
				}
				c.end = d.totalSize - 1;
				delete this.getInfo;
			}
			
			if (d.isResumable) {
				d.resumeDownload();
			}
		}
		catch (ex) {
			Debug.dump("onStartRequest", ex);
		}
	},
	onStopRequest: function DL_onStopRequest(aRequest, aContext, aStatusCode) {
		Debug.dump('StopRequest');
		
		// shortcuts
		var c = this.c;
		c.close();
		
		var d = this.d;

		// update flags and counters
		d.refreshPartialSize();
		d.activeChunks--;

		// check if we're complete now
		let shouldFinish = false;
		if (d.is(RUNNING) && d.chunks.every(function(e) { return e.complete; })) {
			if (!d.resumeDownload()) {
				d.dumpScoreboard();
				d.state = FINISHING;
				shouldFinish = true;
			}
		}

		// routine for normal chunk
		Debug.dump(d + ": Chunk " + c.start + "-" + c.end + " finished.");

		// corrupted range: waiting for all the chunks to be terminated and then restart download from scratch
		if (d.hasToBeRedownloaded) {
			if (!d.is(RUNNING)) {
				Debug.dump(d + ": All old chunks are now finished, reDownload()");
				d.reDownload();
			}
			SessionManager.save(d);
			Debug.dump("out2");
			return;
		}

		if (!d.is(RUNNING)) {
			d.speed = '';
		}
		
		// rude way to determine disconnection: if connection is closed before download is started we assume a server error/disconnection
		if (c.isStarter && !shouldFinish) {
			if (!d.urlManager.markBad(this.url)) {
				Debug.dump(d + ": Server error or disconnection (type 1)");
				d.status = _("srver");
				d.speed = '';
				d.pause();
				return;
			}
			else {
				Debug.dump("caught bad server");
				d.reDownload();
				return;
			}
		}

		// if download is complete
		if (shouldFinish) {
			Debug.dump(d + ": Download is completed!");
			d.finishDownload();
		}
		else if (!d.is(PAUSED, CANCELED)) {
			d.resumeDownload();
		}
		SessionManager.save(d);
	},

	// nsIProgressEventSink
  onProgress: function DL_onProgress(aRequest, aContext, aProgress, aProgressMax) {
		try {
			// shortcuts
			let c = this.c;
			let d = this.d;

			// update download tree row
			if (d.is(RUNNING)) {
				d.refreshPartialSize();

				if (!this.isResumable && d.totalSize) {
					// basic integrity check
					if (d.partialSize > d.totalSize) {
						d.dumpScoreboard();
						Debug.dump(d + ": partialSize > totalSize" + "(" + d.partialSize + "/" + d.totalSize + "/" + ( d.partialSize - d.totalSize) + ")");
						d.fail("Size mismatch", "Actual size of " + d.partialSize + " does not match reported size of " + d.totalSize, "Size mismatch");
						return;
					}
				}
				else {
					d.status = _("downloading");
				}
			}
		}
		catch(ex) {
			Debug.dump("onProgressChange():", e);
		}
	},
	onStatus: function  DL_onStatus(aRequest, aContext, aStatus, aStatusArg) {}
};

function startnewDownloads(notQueue, downloads) {

	var numbefore = Tree.rowCount - 1;
	const DESCS = ['description', 'ultDescription'];
	
	let g = downloads;
	if ('length' in downloads) {
		g = function() { for (let i = 0, e = downloads.length; i < e; ++i) yield downloads[i]; }();
	}

	let added = 0;
	for (let e in g) {
		e.dirSave.addFinalSlash();

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

		var d = new QueueItem(
			e.url,
			e.dirSave,
			e.numIstance,
			desc,
			e.mask,
			e.referrer
		);
		if ('hash' in e && e.hash) {
			d.hash = e.hash;
		}
		else {
			d.hash = null; // to initialize prettyHash 
		}
		d.state = notQueue ? QUEUED : PAUSED;
		if (d.is(QUEUED)) {
			d.status = _('inqueue');
		}
		else {
			d.status = _('paused');
		}
		Tree.add(d);
		++added;
	}

	// full save
	Dialog.setTimer("sd:save", function() { SessionManager.save() }, 100);

	if (Preferences.getDTA("closetab", false)) {
		try {
			DTA_Mediator.removeTab(d.referrer.spec);
		} catch (ex) {
			Debug.dump("failed to close old tab", ex);
		}
	}

	var boxobject = Tree._box;
	boxobject.QueryInterface(Ci.nsITreeBoxObject);
	if (added <= boxobject.getPageLength()) {
		boxobject.scrollToRow(Tree.rowCount - boxobject.getPageLength());
	}
	else {
		boxobject.scrollToRow(numbefore);
	}
	Tree.selection.currentIndex = numbefore + 1;
}

const IOService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
const FileOutputStream = Components.Constructor(
	'@mozilla.org/network/file-output-stream;1',
	'nsIFileOutputStream',
	'init'
);