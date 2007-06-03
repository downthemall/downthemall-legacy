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

var Dialog = {
	_lastSum: 0,
	_initialized: false,
	completed: 0,
	totalbytes: 0,
	init: function D_init() {
		make_();
		Tree.init($("downloads"));
	
		document.getElementById("dtaHelp").hidden = !("openHelp" in window);
	
		sessionManager.init();
	
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
			inProgressList.forEach(
				function(i) {
					sum += i.d.partialSize;
				}
			);
			var speed = Math.round((sum - this._lastSum) * REFRESH_NFREQ);
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

			const now = Utils.getTimestamp();
			inProgressList.forEach(
				function(i) {
					var d = i.d;
					if (d.partialSize != 0 && d.is(RUNNING) && (now - d.timeStart) >= 1000 ) {
						// Calculate estimated time
						if (d.totalSize > 0) {
							var remaining = Math.ceil((d.totalSize - d.partialSize) / ((d.partialSize - i.lastBytes) * REFRESH_NFREQ));
							if (isNaN(remaining)) {
								d.status = _("unknown");
							}
							else {
								d.status = Utils.formatTimeDelta(remaining);
							}
						}
					}
					var speed = Math.round((d.partialSize - i.lastBytes) * REFRESH_NFREQ);

					// Refresh item speed
					d.speed = Utils.formatBytes(speed) + "/s";
					d.speeds.push(speed > 0 ? speed : 0);
					if (d.speeds.length > SPEED_COUNT) {
						d.speeds.shift();
					}
					i.lastBytes = d.partialSize;
				}
			);
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
							d.setPaused();
							d.status = _("timeout");
						}
						else {
							d.cancel(_("timeout"));
						}
						Debug.dump("checkDownloads(): " + d.fileName + " in timeout");
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
					Debug.dump("Let's start " + d.fileName);
				} else {
					Debug.dump("Let's resume " + d.fileName + ": " + d.partialSize);
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
		// only close if last download was complete, meaning the queue really finished,
		// without any user interaction or errors in between
		if (!this._initialized || !download.is(COMPLETE)) {
			return;
		}
		try {
			// check if there is something running or scheduled
			if (this.startNext()) {
				Debug.dump("signal(): not finished");
				return;
			}
			Debug.dump("signal(): Queue finished");
			Utils.playSound("done");
			
			if (this.completed > 0) {
				var msg = _('suc');
				
				if (Prefs.alertingSystem == 1) {
					AlertService.show(_("dcom"), _('suc'), true, Tree.at(0).destinationPath);
				}
				else if (Prefs.alertingSystem == 0) {
					if (confirm(_('suc') + "\n "+ _("folder")) == 1) {
						try {
							OpenExternal.launch(Tree.at(0).destinationPath);
						}
						catch (ex){
							// no-op
						}
					}
				}
			}

			sessionManager.save();
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
		this._killTimers();		
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
				d.setPaused();				
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
		// alright, we left the loop.. shutdown complete ;)
		sessionManager.save();
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


DTA_include('dta/manager/prefs.js');

DTA_include('dta/manager/urlmanager.js');
DTA_include('dta/manager/visitormanager.js');

function Decompressor(download) {
	this.download = download;
	this.to = new FileFactory(download.destinationFile);
	this.from = download.tmpFile.clone();

	download.state = FINISHING;
	download.status =  _("decompress");
	try {

		this._outStream = Cc['@mozilla.org/network/file-output-stream;1']
			.createInstance(Ci.nsIFileOutputStream);
		this._outStream.init(this.to, 0x04 | 0x08, 0766, 0);
		try {
			// we don't know the actual size, so best we can do is to seek to totalSize.
			var seekable = this._outStream.QueryInterface(Ci.nsISeekableStream);
			seekable.seek(0x00, download.totalSize);
			try {
				seekable.setEOF();
			}
			catch (ex) {
				// no-op
			}
			seekable.seek(0x00, 0);
		}
		catch (ex) {
			// no-op
		}
		var boutStream = Cc['@mozilla.org/network/buffered-output-stream;1']
			.createInstance(Ci.nsIBufferedOutputStream);
		boutStream.init(this._outStream, MAX_BUFFER_SIZE);
		this.outStream = boutStream;
		boutStream = Cc['@mozilla.org/binaryoutputstream;1']
			.createInstance(Ci.nsIBinaryOutputStream);
		boutStream.setOutputStream(this.outStream);
		this.outStream = boutStream;

		var converter = Cc["@mozilla.org/streamconv;1?from=" + download.compressionType + "&to=uncompressed"]
			.createInstance(Ci.nsIStreamConverter);

		converter.asyncConvertData(
			download.compressionType,
			"uncompressed",
			this,
			null
		);

		var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
		ios
			.newChannelFromURI(ios.newFileURI(this.from))
			.asyncOpen(converter, null);
	}
	catch (ex) {
		try {
			if (this.outStream) {
				outStream.close();
			}
			if (this.to.exists()) {
				this.to.remove(false);
			}
			if (this.from.exists()) {
				this.from.remove(false);
			}
		}
		catch (ex) {
			// XXX: what now?
		}
		download.finishDownload(ex);
	}
}
Decompressor.prototype = {
	exception: null,
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsIStreamListener) || iid.equals(cI.nsIRequestObserver)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	onStartRequest: function(r, c) {},
	onStopRequest: function(request, c) {
		// important, or else we don't write out the last buffer and truncate too early. :p
		this.outStream.flush();
		try {
			this._outStream.QueryInterface(Ci.nsISeekableStream).setEOF();
		}
		catch (ex) {
			this.exception = ex;
		}
		this._outStream.close();
		if (this.exception) {
			try {
				this.to.remove(false);
			}
			catch (ex) {
				// no-op: we're already bad :p
			}
		}
		try {
			this.from.remove(false);
		}
		catch (ex) {
			Debug.dump("Failed to remove tmpFile", ex);
		}

		this.download.finishDownload(this.exception);
	},
	onDataAvailable: function(request, c, stream, offset, count) {
		try {
			var binStream = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
			binStream.setInputStream(stream);
			if (count != this.outStream.write(binStream.readBytes(count), count)) {
				throw new Components.Exception("Failed to write!");
			}
		}
		catch (ex) {
			this.exception = ex;
			var reason = 0x804b0002; // NS_BINDING_ABORTED;
			request.cancel(reason);
		}
	}
};

function QueueItem(lnk, dir, num, desc, mask, refPage, tmpFile) {

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
	this.refPage = Cc['@mozilla.org/network/standard-url;1'].createInstance(Ci.nsIURI);
	this.refPage.spec = refPage;

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

	compression: false,
	compressionType: "",

	isResumable: false,
	isStarted: false,

	fileManager: null,
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
			if (this.fileManager.exists()) {
				return this.fileManager.fileSize;
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
		return Math.round(this.partialSize / this.totalSize * 100) + "%";
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
		// replace names
		Debug.dump(this.urlManager.usable);
		this.fileName = this.urlManager.usable.getUsableFileName();

		// reset flags
		this.setPaused();
		this.totalSize = 0;
		this.partialSize = 0;
		this.compression = false;
		this.activeChunks = 0;
		this.chunks = [];
		this.visitors = new VisitorManager();
		this.resumeDownload();
	},

	removeFromInProgressList: function QI_removeFromInProgressList() {
		//this.speeds = new Array();
		for (var i=0; i<inProgressList.length; i++)
			if (this==inProgressList[i].d) {
				inProgressList.splice(i, 1);
				break;
			}
	},
	
	refreshPartialSize: function QI_refreshPartialSize(){
		var size = 0;
		this.chunks.forEach(function(c) { size += c.written; });
		this.partialSize = size;
	},

	setPaused: function QI_setPaused(){
		if (this.chunks) {
			for (let i = 0, e = this.chunks.length; i < e; ++i) {
				if (this.chunks[i].isRunning) {
					this.chunks[i].download.cancel();
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
			var destination = new FileFactory(this.destinationPath);
			Debug.dump(this.fileName + ": Move " + this.tmpFile.path + " to " + this.destinationFile);

			if (!destination.exists()) {
				destination.create(Ci.nsIFile.DIRECTORY_TYPE, 0766);
			}
			this.checkFilenameConflict();
			// move file
			if (this.compression) {
				new Decompressor(this);
			}
			else {
				this.tmpFile.clone().moveTo(destination, this.destinationName);
				this.finishDownload(null);
			}
		}
		catch(ex) {
			this.finishDownload(ex);
		}
	},
	handleMetalink: function QI_handleMetaLink() {
		try {
			Tree.remove(this);
			var file = new FileFactory(this.destinationFile);

			var fiStream = Cc['@mozilla.org/network/file-input-stream;1']
				.createInstance(Ci.nsIFileInputStream);
			fiStream.init(file, 1, 0, false);
			var domParser = new DOMParser();
			var doc = domParser.parseFromStream(fiStream, null, file.fileSize, "application/xml");
			var root = doc.documentElement;
			fiStream.close();

			try {
				file.remove(false);
			} catch (ex) {
				Debug.dump("failed to remove metalink file!", ex);
			}

			var downloads = [];
			var files = root.getElementsByTagName('file');
			for (var i = 0; i < files.length; ++i) {
				var file = files[i];
				var urls = [];
				var urlNodes = file.getElementsByTagName('url');
				for (var j = 0; j < urlNodes.length; ++j) {
					var url = urlNodes[j];
					if (['http', 'https'].indexOf(url.getAttribute('type')) != -1) {
						urls.push(new DTA_URL(url.textContent, doc.characterSet));
					}
				}
				if (!urls.length) {
					continue;
				}
				var desc = root.getElementsByTagName('description');
				if (desc.length) {
					desc = desc[0].textContent;
				}
				else {
					desc = '';
				}
				downloads.push({
					'url': new UrlManager(urls),
					'refPage': this.refPage.spec,
					'numIstance': 0,
					'mask': this.mask,
					'dirSave': this.pathName,
					'description': desc,
					'ultDescription': ''
				});
			}
			if (downloads.length) {
				startnewDownloads(true, downloads);
			}
		} catch (ex) {
			Debug.dump("hml exception", ex);
		}
	},
	finishDownload: function QI_finishDownload(exception) {
		if (exception) {
			this.fail(_("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
			Debug.dump("download::moveCompleted: Could not move file or create directory: ", exception);
			return;
		}
		Debug.dump("finishDownload, connections", this.sessionConnections);
		// create final file pointer
		this.fileManager = new FileFactory(this.destinationFile);

		if (Prefs.setTime) {
			try {
				var time = this.startDate.getTime();
				try {
					var time =  this.visitors.time;
				}
				catch (ex) {
					// no-op
					Debug.dump("vmt", ex);
				}
				// small validation. Around epoche? More than a month in future?
				if (time < 2 || time > Date.now() + 30 * 86400000) {
					throw new Components.Exception("invalid date encountered: " + time + ", will not set it");
				}
				// have to unwrap
				var file = this.fileManager.clone();
				file.lastModifiedTime = time;
			}
			catch (ex) {
				Debug.dump("Setting timestamp on file failed: ", ex);
			}
		}
		this.totalSize = this.partialSize = this.size;

		this.status = _("complete");
		if ('isMetalink' in this) {
			this.handleMetalink();
		}
		this.state = COMPLETE;

		// increment completedDownloads counter
		Dialog.completed++;

		// Garbage collection
		this.chunks = [];
	},

	rebuildDestination: function QI_rebuildDestination() {
		try {
			var url = this.urlManager.usable;
			var uri = Cc['@mozilla.org/network/standard-url;1']
				.createInstance(Ci.nsIURL);
			uri.spec = url;

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
				"\\*name\\*": name,
				"\\*ext\\*": ext,
				"\\*text\\*": this.description,
				"\\*url\\*": uri.host,
				"\\*subdirs\\*": uripath,
				"\\*refer\\*": this.refPage.host,
				"\\*qstring\\*": query,
				"\\*curl\\*": (uri.host + ((uripath=="")?"":(SYSTEMSLASH + uripath))),
				"\\*num\\*": Utils.makeNumber(this.numIstance),
				"\\*hh\\*": Utils.makeNumber(this.startDate.getHours(), 2),
				"\\*mm\\*": Utils.makeNumber(this.startDate.getMinutes(), 2),
				"\\*ss\\*": Utils.makeNumber(this.startDate.getSeconds(), 2),
				"\\*d\\*": Utils.makeNumber(this.startDate.getDate(), 2),
				"\\*m\\*": Utils.makeNumber(this.startDate.getMonth(), 2),
				"\\*y\\*": String(this.startDate.getFullYear())
			}

			for (i in replacements) {
				mask = mask.replace(new RegExp(i, "gi"), replacements[i]);
			}

			this._destinationFile = mask = this.pathName.addFinalSlash() + mask.removeBadChars().removeFinalChar(".").trim();
			mask = mask.split(SYSTEMSLASH);
			this._destinationName = mask.pop();
			this._destinationPath = mask.join(SYSTEMSLASH).addFinalSlash();
		} catch(ex) {
			this._destinationName = this.fileName;
			this._destinationPath = this.pathName.addFinalSlash();
			this._destinationFile = this._destinationPath + this._destinationName;
			Debug.dump("buildFromMask():", ex);
		}
		this._icon = null;
	},

	checkFilenameConflict: function  QI_checkFileNameConflict() {
		var dn = this.destinationName, ds = this.destinationPath;
		var dest = new FileFactory(ds + dn), newDest = dest.clone();

		// figure out an unique name
		var basename = dn, ext = '', pos = basename.lastIndexOf('.');
		if (pos != -1) {
			ext = basename.slice(pos);
			basename = basename.slice(0, pos);
		}
		for (var i = 1; isInProgress(newDest.path, this) != -1 || newDest.exists(); ++i) {
			newDest.leafName = basename + "_" +  Utils.makeNumber(i) + ext;
		}
		if (newDest.path == dest.path) {
			return;
		}
		newDest = newDest.leafName;

		var shortUrl = this.urlManager.usable.cropCenter(70);

		function mc(aCaption, aValue) {
			return {caption: aCaption, value: aValue};
		}

		var s = -1, p;
		if (dest.exists()) {
			s = askForRenaming(
				_('alreadyexists', [dn, ds]) + " " + _('whatdoyouwith', [shortUrl]),
				mc(_('reninto', [newDest]), 0),
				mc(_('overwrite'), 1),
				mc(_('skip'), 2)
			);
		}
		else if (this.is(FINISHING)) {
			s = askForRenaming(
				_("alreadyexists", [dn, ds]) + " " + _("whatdoyoucomplete", [shortUrl]),
				mc(_('reninto', [newDest]), 0),
				mc(_('overwrite'), 1),
				mc(_('cancel'), 4)
			);
		}
		else if (-1 != (p = isInProgress(dest.path, this))) {
			s = askForRenaming(
				_("samedestination", [shortUrl, dn, inProgressList[p].d.urlManager.url]) + " " + _("whatdoyou"),
				mc(_('reninto', [newDest]), 0),
				mc(_('skipfirst'), 2),
				mc(_('cancelsecond'), 3)
			);
		}
		if (s < 0) {
			return;
		}

		if (s == 0) {
			this.destinationName = newDest;
		}
		else if (s == 1) {
			dest.remove(false);
		}
		else if (s == 2) {
			this.cancel(_('skipped'));
		}
		else if (s == 3) {
			inProgressList[p].d.cancel();
		}
		else {
			this.cancel();
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
				this.setPaused();
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
				Debug.dump("removeTmpFile", ex);
			}
		}
	},
	sessionConnections: 0,
	resumeDownload: function QI_resumeDownload() {

		function downloadNewChunk(download, start, end, header) {
			var chunk = new Chunk(download, start, end);
			download.chunks.push(chunk);
			downloadChunk(download, chunk, header);
			download.sessionConnctions = 0;
		}
		function downloadChunk(download, chunk, header) {
			chunk.isRunning = true;
			download.state = RUNNING;
			chunk.download = new Download(download, chunk, header);
			if (header) {
				Debug.dump(download.fileName + ": Created Header Chunk Test (" + chunk.start + "-" + chunk.end + ")");
			}
			else {
				Debug.dump(download.fileName + ": Created chunk of range " + chunk.start + "-" + chunk.end);
			}
			++download.activeChunks;
			++download.sessionConnections;
		}

		try {
			if (!this.maxChunks) {
				this.maxChunks = Prefs.maxChunks;
			}
			if (this.maxChunks <= this.activeChunks) {
				return false;
			}

			Debug.dump(this.fileName + ": resumeDownload");

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
				
				var mincs = MIN_CHUNK_SIZE * this.activeChunks;

				// find biggest chunk
				var biggest = null;
				this.chunks.forEach(
					function (chunk) {
						if (chunk.remainder > mincs * 2 && (!biggest || chunk.remainder > biggest.remainder)) {
							biggest = chunk;
						}
					}
				);

				// nothing found, break
				if (!biggest) {
					break;
				}
				var end = biggest.end;
				biggest.end = biggest.start + biggest.written + Math.floor(biggest.remainder / 2);
				downloadNewChunk(this, biggest.end + 1, end);
				rv = true;
			}

			// update ui
			return rv;
		}
		catch(ex) {
			Debug.dump("resumeDownload():", ex);
		}
		return false;
	}
}

function inProgressElement(el) {
	this.d = el;
	this.lastBytes = el.partialSize;
}

var inProgressList = new Array();

DTA_include('dta/manager/alertservice.js');

var Chunk = function(download, start, end, written) {
	// saveguard against null or strings and such
	this._written = written > 0 ? written : 0;
	this._start = start;
	this.end = end;
	this._parent = download;
}

Chunk.prototype = {
	isRunning: false,
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
		return this._total == this._written;
	},
	get parent() {
		return this._parent;
	},
	close: function CH_close() {
		this.isRunning = false;
		if (this._outStream) {
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
				Debug.dump("creating outStream");
				var file = this.parent.tmpFile;
				if (!file.parent.exists()) {
					file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0700);
				}
				var prealloc = !file.exists();
				var outStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);

				outStream.init(file, 0x04 | 0x08, 0766, 0);
				var seekable = outStream.QueryInterface(Ci.nsISeekableStream);
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
			}
			bytes = this.remainder;
			if (!this.total || aCount < bytes) {
				bytes = aCount;
			}
			if (!bytes) {
				Debug.dump(aCount + " - " + this.start + " " + this.end + " " + this.written + " " + this.remainder + " ");
				return 0;
			}
			if (bytes < 0) {
				throw new Components.Exception("bytes negative");
			}
			// need to wrap this as nsIInputStream::read is marked non-scriptable.
			var byteStream = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
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
	}
}

function Download(d, c, headerHack) {

	this.d = d;
	this.c = c;
	this.isHeaderHack = headerHack;
	this.url = d.urlManager.getURL();
	var referrer = d.refPage;

	this._chan = this._ios.newChannelFromURI(this._ios.newURI(this.url.url, null, null));
	var r = Ci.nsIRequest;
	this._chan.loadFlags = r.LOAD_NORMAL | r.LOAD_BYPASS_CACHE;
	this._chan.notificationCallbacks = this;
	try {
		var encodedChannel = this._chan.QueryInterface(Ci.nsIEncodedChannel);
		encodedChannel.applyConversion = false;
	}
	catch (ex) {
		Debug.dump("ec", ex);
	}
	if (referrer) {
		try {
			var http = this._chan.QueryInterface(Ci.nsIHttpChannel);
			//http.setRequestHeader('Accept-Encoding', 'none', false);
			if (c.end > 0) {
				http.setRequestHeader('Range', 'bytes=' + (c.start + c.written) + "-", false);
			}
			if (typeof(referrer) == 'string') {
				referrer = this._ios.newURI(referrer, null, null);
			}
			http.referrer = referrer;
		}
		catch (ex) {

		}
	}
	this.c.isRunning = true;
	this._chan.asyncOpen(this, null);
}
Download.prototype = {
	_ios: Components.classes["@mozilla.org/network/io-service;1"]
		.getService(Components.interfaces.nsIIOService),
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
			Debug.dump("NF: " + iid);
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
		Debug.dump("cancel");
		try {
			if (this._closed) {
				return;
			}
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
			Debug.dump("getInterface " + iid, ex);
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

	handleHttp: function DL_handleHttp(aChannel) {
		var c = this.c;
		var d = this.d;
		
		if (aChannel.responseStatus >= 400) {
			Debug.dump("problem found; trying to recover");
			var found = -1;
			for (let i = 0; i < d.chunks.length; ++i) {
				if (d.chunks[i] == c) {
					found = --i;
					break;
				}
			}
			Debug.dump("found self", found);
			for (let i = found; i > -1; --i) {
				if (d.chunks[i].isRunning) {
					Debug.dump("found joinable chunk; recovering suceeded", i);
					d.chunks[i].end = c.end;
					if (--d.maxChunks == 1) {
						d.isResumable = false;
					}
					this.cancel();
					d.chunks = d.chunks.filter(function(ch) { return ch != c; });
					sessionManager.save(d);
					return;
				}
			}
			Debug.dump("Cannot recover from problem!", aChannel.responseStatus);
			d.fail(
				_("error", [aChannel.responseStatus]),
				_("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]) + " " + _("sra", [aChannel.responseStatus]) + ": " + aChannel.responseStatusText,
				_("error", [aChannel.responseStatus])
			);
			sessionManager.save(d);
			return;
		}

		// not partial content altough we are multi-chunk
		if (aChannel.responseStatus != 206 && c.end != 0) {
			Debug.dump(d.fileName + ": Server returned a " + aChannel.responseStatus + " response instead of 206... Normal mode");
			vis = {visitHeader: function(a,b) { Debug.dump(a + ': ' + b); }};
			aChannel.visitRequestHeaders(vis);
			aChannel.visitResponseHeaders(vis);
			d.hasToBeRedownloaded = true;
			d.reDownload();
			return;
		}

		var visitor = null;
		try {
			visitor = d.visitors.visit(aChannel);
		}
		catch (ex) {
			Debug.dump("header failed! " + d.fileName, ex);
			// restart download from the beginning
			d.hasToBeRedownloaded = true;
			d.reDownload();
			return;
		}
		
		// this.isHeaderHack = it's the chunk that has to test response headers
		if (this.isHeaderHack) {
			Debug.dump(d.fileName + ": Test Header Chunk started");

			// content-type
			if (visitor.type) {
				d.contentType = visitor.type;
			}

			// compression?
			d.compression = (
				(visitor.encoding=="gzip"||visitor.encoding=="deflate")
				&&
				!(/gzip/).test(d.contentType)
				&&
				!(/\.gz/).test(d.fileName)
			);
			if (d.compression) {
				d.compressionType = visitor.encoding;
			}

			// accept range
			d.isResumable = visitor.acceptRanges;

			Debug.dump("type: " + visitor.type);
			if (visitor.type && visitor.type.search(/application\/metalink\+xml/) != -1) {
				Debug.dump(aChannel.URI.spec + " iml");
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
		}
	},
	
	// Generic handler for now :p
	handleFtp: function  DL_handleFtp(aChannel) {
		Debug.dump("handleFtp: " + aChannel.URI.spec);
		return this.handleGeneric(aChannel, aContext);
	},
	
	handleGeneric: function DL_handleGeneric(aChannel) {
		var c = this.c;
		var d = this.d;
		
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
				try {
					let sc = this._supportedChannels[i];
					let chan = aRequest.QueryInterface(sc.i);
					this[sc.f](chan);
					Debug.dump("handled with: " + sc.f);
					break;
				}
				catch (ex) {
					Debug.dump(ex);
					// no-op
				}
			}

			if (this.isHeadersHack) {
				// Checks for available disk space.
				
				var tsd = d.totalSize;
				try {
					if (tsd) {
						if (Prefs.tempLocation && Prefs.tempLocation.diskSpaceAvailable < tsd) {
							d.fail(_("ndsa"), _("spacetemp"), _("freespace"));
							return;
						}
						let realDest = new FileFactory(d.destinationPath);
						if (!realDest.exists()) {
							realDest.create(Ci.nsiFile.DIRECTORY_TYPE, 0766);
						}
						if (!realDest.isWriteable() || !Prefs.tmpLocation.isWritable()) {
							throw new Components.Exception("Paths write protected");
						}
						var nsd = realDest.diskSpaceAvailable;
						// Same save path or same disk (we assume that tmp.avail == dst.avail means same disk)
						// simply moving should succeed
						if (d.compression && !Prefs.tempLocation || Prefs.tempLocation.diskSpaceAvailable == nsd) {
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
					d.fail(_("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
					return;
				}
				
				// if we are redownloading the file, here we can force single chunk mode
				if (d.hasToBeRedownloaded) {
					d.hasToBeRedownloaded = null;
					d.isResumable = false;
				}
	
				if (d.totalSize <= 0) {
					d.maxChunks = 1;
					d.isResumable = false;
					c.end = d.totalSize - 1;
				}
				d.resumeDownload();
	
				this.isHeaderHack = false;
			} else {
				Debug.dump(d.fileName + ": Chunk " + c.start + "-" + + c.end + " started");
			}

			d.checkFilenameConflict();
	
			if (!d.totalSize) {
				this.cantCount = true;
			}					
			if (this.cantCount || !d.isResumable) {
				d.maxChunks = 1;
			}
			c.end = d.totalSize - 1;
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
		if (d.is(RUNNING) && !d.chunks.some(function(e) { return e.isRunning; })) {
			d.state = FINISHING;
		}

		// routine for normal chunk
		Debug.dump(d.fileName + ": Chunk " + c.start + "-" + c.end + " finished.");

		// corrupted range: waiting for all the chunks to be terminated and then restart download from scratch
		if (d.hasToBeRedownloaded) {
			if (!d.is(RUNNING)) {
				Debug.dump(d.fileName + ": All old chunks are now finished, reDownload()");
				d.reDownload();
			}
			sessionManager.save(d);
			Debug.dump("out2");
			return;
		}

		// ok, chunk passed all the integrity checks!

		// isHeaderHack chunks have their private call to removeFromInProgressList
		if (!d.is(RUNNING)) {
			d.speed = '';
			d.removeFromInProgressList();
		}

		// rude way to determine disconnection: if connection is closed before download is started we assume a server error/disconnection
		if (!this.started && d.isResumable && !d.is(CANCELED, PAUSED)) {
			Debug.dump(d.fileName + ": Server error or disconnection (type 1)");
			d.status = _("srver");
			d.speed = '';
			d.setPaused();
		}

		// if download is complete
		if (d.is(FINISHING)) {
			Debug.dump(d.fileName + ": Download is completed!");
			d.moveCompleted();
		}
		else if (d.is(PAUSED) && !d.isResumable) {
			// reset download as it was never started (in queue state)
			d.isStarted = false;
			d.setPaused();
			d.chunks = [];
			d.totalSize = 0;
			d.partialSize = 0;
			d.compression = false;
			d.activeChunks = 0;
			d.visitors = new VisitorManager();
		}
		else if (d.is(RUNNING) && d.isResumable) {
			// if all the download space has already been occupied by chunks (= !resumeDownload)
			d.resumeDownload();
		}
		sessionManager.save(d);
	},

	// nsIProgressEventSink
  onProgress: function DL_onProgress(aRequest, aContext, aProgress, aProgressMax) {
		//Debug.dump('Progress ' + aProgress + "/" + aProgressMax);
		try {

			// shortcuts
			var c = this.c;
			var d = this.d;

			/*if (d.is(PAUSED, CANCELED)) {
				this.cancel();
				return;
			}*/

			// update download tree row
			if (d.is(RUNNING)) {
				d.refreshPartialSize();

				if (!this.cantCount) {
					// basic integrity check
					if (d.partialSize > d.totalSize) {
						Debug.dump(d.fileName + ": partialSize > totalSize" + "(" + d.partialSize + "/" + d.totalSize + "/" + ( d.partialSize - d.totalSize) + ")");
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


function startnewDownloads(notQueue, download) {

	var numbefore = Tree.rowCount - 1;
	const DESCS = ['description', 'ultDescription'];

	for (var i=0; i<download.length; i++) {
		var e = download[i];

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
			e.refPage
		);
		d.state = notQueue ? QUEUED : PAUSED;
		if (d.is(QUEUED)) {
			d.status = _('paused');
		}
		else {
			d.status = _('inqueue');
		}
		Tree.add(d);
	}

	// full save
	sessionManager.save();

	if (Preferences.getDTA("closetab", false)) {
		try {
			DTA_Mediator.removeTab(d.refPage.spec);
		} catch (ex) {
			Debug.dump("failed to close old tab", ex);
		}
	}

	var boxobject = Tree._box;
	boxobject.QueryInterface(Ci.nsITreeBoxObject);
	if (download.length <= boxobject.getPageLength())
		boxobject.scrollToRow(Tree.rowCount - boxobject.getPageLength());
	else
		boxobject.scrollToRow(numbefore);

	Tree.selection.currentIndex = numbefore + 1;

	Dialog.checkDownloads();
}

function isInProgress(path, d) {
	for (var x=0; x<inProgressList.length; x++)
		if ((inProgressList[x].d.destinationFile) == path && d != inProgressList[x].d)
			return x;
	return -1;
}

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

DTA_include('dta/manager/filehandling.js');
DTA_include('dta/manager/sessionmanager.js');
DTA_include('dta/manager/tooltip.js');