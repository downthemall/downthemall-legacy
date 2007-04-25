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
 *    Stefano Verna
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
	
// true if some dialog.xul is opened
var isOpenedMessagebox = 0;
// your tree
var tree = null;

if (!Cc) {
	var Cc = Components.classes;
}
if (!Ci) {
	var Ci = Components.interfaces;
}

const MIN_CHUNK_SIZE = 512 * 1024;
// in use by chunk.writer...
// in use by decompressor... beware, actual size might be more than twice as big!
const MAX_BUFFER_SIZE = 3145728; // 3 MB

DTA_include('chrome://dta/content/dta/manager/prefs.js');
//DTA_include('chrome://dta/content/dta/manager/tree.js');

// --------* Statistiche *--------
var Stats = {
	totalDownloads: 0,

	// XXX/DC Debug this crap,
	_completedDownloads: 0,
	get completedDownloads() { return this._completedDownloads; },
	set completedDownloads(nv) { if (0 > (this._completedDownloads = nv)) { throw "Stats::Completed downloads less than 1"; } },

	downloadedBytes: 0
}

DTA_include('chrome://dta/content/dta/manager/urlmanager.js');
DTA_include('chrome://dta/content/dta/manager/visitormanager.js');

var chunkElement = function(start, end, d) {
	//Debug.dump('ChunkElement: ' + start + "/" + end);
	this._start = start;
	this.end = end;
	this.parent = d;
}

chunkElement.prototype = {
	next: -1,
	previous: -1,
	isRunning: false,
	chunkName: "",
	imWaitingToRearrange: false,
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
	get size() {
		return this._written;
	},
	get remainder() {
		return this._total - this._written;
	},
	get complete() {
		return this._total == this.written;
	},
	remove: function() {
		this.close();
	},
	close: function() {
		this.isRunning = false;
		if (this._outStream) {
			this._outStream.close();
			delete this._outStream;
		}
	},
	_written: 0,
	_outStream: null,
	write: function(aInputStream, aCount) {
		try {
			if (!this._outStream) {
				Debug.dump("creating outStream");
				var file = this.parent.tmpFile;
				if (!file.parent.exists()) {
					file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0700);
				}
				var outStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
				outStream.init(file, 0x04 | 0x08, 0766, 0);
				outStream.QueryInterface(Ci.nsISeekableStream).seek(0x00, this.start);
				this._outStream = Cc['@mozilla.org/network/buffered-output-stream;1'].createInstance(Ci.nsIBufferedOutputStream);
				this._outStream.init(outStream, Math.floor(MAX_BUFFER_SIZE / Prefs.maxChunks));
			}
			bytes = this.remainder;
			if (aCount < bytes) {
				bytes = aCount;
			}
			if (!bytes) {
				Debug.dump(aCount + " - " + this.start + " " + this.end + " " + this.size + " " + this.remainder + " ");
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
				throw ("dataCopyListener::dataAvailable: read/write count mismatch!");
			}
			this._written += bytes;
			return bytes;
		} catch (ex) {
			Debug.dump('write:', ex);
			throw ex;
		}
		return 0;
	}
}

const treeCells = {
	"parts": 5,
	"speed": 8,
	"percent": 1,
	"size": 3,
	"bar":2,
	"status": 4,
	"url": 0,
	"dir": 7,
	"mask": 6
}

function CopyListener(boutStream) {
	this.boutStream = boutStream;
}
CopyListener.prototype = {
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsIStreamListener) || iid.equals(cI.nsIRequestObserver)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	onStartRequest: function(r, c) {},
	onStopRequest: function(r, c) {},
	onDataAvailable: function(r, c, stream, offset, count) {
		var binStream = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
		binStream.setInputStream(stream);
		this.boutStream.write(binStream.readBytes(count), count);
	}
};

function downloadElement(lnk, dir, num, desc, mask, refPage, tmpFile) {

	this.visitors = new VisitorManager();

	dir = dir.addFinalSlash();

	if (typeof lnk == 'string') {
		this.urlManager = new DTA_URLManager([new DTA_URL(lnk)]);
	} else if (lnk instanceof DTA_URLManager) {
		this.urlManager = lnk;
	} else {
		this.urlManager = new DTA_URLManager([lnk]);
	}

	this.dirSave = dir;
	this.originalDirSave = dir;
	this.destinationName = this.fileName = this.urlManager.usable.getUsableFileName();
	this.mask = mask;
	this.numIstance = num;
	this.description = desc;
	this.chunks = [];
	this.speeds = new Array();
	this.refPage = Cc['@mozilla.org/network/standard-url;1'].createInstance(Ci.nsIURI);
	this.refPage.spec = refPage;
	
	// XXX: reset ranges when failed.
	if (tmpFile) {
		try {
			tmpFile = new FileFactory(tmpFile);
			if (tmpFile.exists()) {
				this._tmpFile = tmpFile;
			}
		}
		catch (ex) {
			Debug.dump("tried to construct with invalid tmpFile", ex);
		}
	}
}

const QUEUED = 0;
const PAUSED =  1<<1;
const RUNNING = 1<<2;
const COMPLETE = 1<<3;
const CANCELED = 1<<4;

downloadElement.prototype = {
	_state: QUEUED,
	get state() {
		return this._state;
	},
	set state(ns) {
		Debug.dump('SS: ' + this._state + "/" + ns);
		this._state = ns;
	},
	
	_tmpFile: null,
	get tmpFile() {
		if (!this._tmpFile) {
			var dest = Prefs.tempLocation
				? Prefs.tempLocation.clone()
				: new FileFactory(this.parent.dirSave);
			dest.append(this.fileName + '.dtapart');
			this._tmpFile = dest;
		}
		return this._tmpFile;
	},
	
	/**
	 *Takes one or more state indicators and returns if this download is in state of any of them
	 */
	is: function() {
		for (var i = 0; i < arguments.length; ++i) {
			if (this.state == arguments[i]) {
				return true;
			}
		}
		return false;
	},
	
	contentType: "",
	visitors: null,
	totalSize: 0,
	partialSize: 0,
	startDate: null,

	compression: false,
	compressionType: "",

	treeID: "",
	alreadyMaskedDir: false,
	alreadyMaskedName: false,

	isResumable: false,
	isStarted: false,
	isPassed: false,
	isRemoved: false,

	isFirst: false,

	fileManager: null,
	activeChunks: 0,
	maxChunks: null,
	timeLastProgress: 0,
	timeStart: 0,

	get icon() {
		return getIcon(this.fileName, 'metalink' in this);
	},

	imWaitingToRearrange: false,

	_hasToBeRedownloaded: false,
	get hasToBeRedownloaded() {
		return this._hasToBeRedownloaded;
	},
	set hasToBeRedownloaded(nv) {
		Debug.dump("HR: " + this._hasToBeRedownloaded + "/" + nv);
		return this._hasToBeRedownloaded = nv;
	},
	reDownload: function() {
		// replace names
		Debug.dump(this.urlManager.usable);
		this.destinationName = this.fileName = this.urlManager.usable.getUsableFileName();
		this.alreadyMaskedName = false;
		this.alreadyMaskedDir = false;
		this.dirSave = this.originalDirSave;

		// reset flags
		this.setPaused();
		this.totalSize = 0;
		this.partialSize = 0;
		this.compression = false;
		this.activeChunks = 0;
		this.chunks = [];
		this.visitors = new VisitorManager();
		this.getHeader();
	},

	treeElement: null,
	setTreeCell: function(cell, caption) {
		if (this.isRemoved) return;
		if (this.treeElement==null)
			this.treeElement = $(this.treeID).childNodes[0];
		this.treeElement.childNodes[treeCells[cell]].attributes.label.value = caption;
	},

	setTreeProgress: function(style, value) {
		if (this.isRemoved) return;
		$(this.treeID).childNodes[0].childNodes[treeCells["bar"]].attributes.properties.value = style;
		if (value)
			$(this.treeID).childNodes[0].childNodes[treeCells["bar"]].attributes.value.value = value;
	},

	removeFromInProgressList: function() {
		//this.speeds = new Array();
		for (var i=0; i<inProgressList.length; i++)
			if (this==inProgressList[i].d) {
				inProgressList.splice(i, 1);
				break;
			}
	},

	refreshPartialSize: function(){
		var size = 0;
		for (var i = 0; i<this.chunks.length; i++)
			size += this.chunks[i].size;
		this.partialSize = size;
		return size;
	},

	setPaused: function(){
		if (this.chunks) {
			for (var i = 0; i < this.chunks.length; i++) {
				if (this.chunks[i].isRunning) {
					this.chunks[i].download.cancel();
				}
			}
		}
	},

	getSize: function() {
		try {
			if (this.fileManager.exists())
				return this.fileManager.fileSize;
			else
				Debug.dump("downloadElement::getSize(): File doesn't exists!");
		} catch (e) {Debug.dump("download::getSize(): ", e)}
		return 0;
	},

	moveCompleted: function(file) {
		Debug.dump("mc");
		if (this.is(CANCELED)) {
			return;
		}

		// increment completedDownloads counter
		this.state = COMPLETE;
		Stats.completedDownloads++;

		try {
			var destination = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
			destination.initWithPath(this.dirSave);
			Debug.dump(this.fileName + ": Move " + file.path + " to " + this.dirSave + this.destinationName);

			if (!destination.exists()) {
				destination.create(Ci.nsIFile.DIRECTORY_TYPE, 0766);
			}
			this.checkFilenameConflict();
			// move file
			if (this.compression) {
				//throw new Error("No decompressor ATM");
				
				destination.append(this.destinationName);
				
				var outStream = Cc['@mozilla.org/network/file-output-stream;1']
					.createInstance(Ci.nsIFileOutputStream);
				outStream.init(destination, 0x04 | 0x08, 0766, 0);
				var boutStream = Cc['@mozilla.org/network/buffered-output-stream;1']
					.createInstance(Ci.nsIBufferedOutputStream);
				boutStream.init(outStream, MAX_BUFFER_SIZE);
				outStream = boutStream;
				boutStream = Cc['@mozilla.org/binaryoutputstream;1']
					.createInstance(Ci.nsIBinaryOutputStream);
				boutStream.setOutputStream(outStream);
				outStream = boutStream;
				
				try {
					var inStream = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
					inStream.init(file,  0x01, 0766, 0);
					
					Debug.dump(this.compressionType);
					var converter = Cc["@mozilla.org/streamconv;1?from=" + this.compressionType + "&to=uncompressed"]
						.createInstance(Ci.nsIStreamConverter);
					var cl = new CopyListener(outStream);
					converter.asyncConvertData(
						this.compressionType,
						"uncompressed",
						cl,
						null
					);
					converter.onStartRequest(null, null);
					while (inStream.available()) {
						var count = inStream.available();
						if (count > MAX_BUFFER_SIZE) {
							count = MAX_BUFFER_SIZE;
						}
						converter.onDataAvailable(null, null, inStream, 0, count);
					}
					converter.onStopRequest(null, null, 0);

					delete converter;
					delete cl;
					outStream.close();
					inStream.close();
					delete outStream;
					delete inStream;					
				}
				catch (ex) {
					try {
						outStream.close();
						destination.remove();
					}
					catch (ex) {
						// XXX: what now?
					}
					throw ex;
				}
				file.remove(false);
			}
			else {
				file.moveTo(destination, this.destinationName);
			}

		}
		catch(ex) {
			this.fail(_("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
			Debug.dump("download::moveCompleted: Could not move file or create directory: ", ex);
			return;
		}
		this.finishDownload();
		if ('isMetalink' in this) {
			this.handleMetalink();
		}
		Check.checkClose();
	},
	handleMetalink: function dl_handleMetaLink() {
		try {
			for (var i = 0; i < downloadList.length; ++i)
			{
				if (downloadList[i] == this) {
					removeElement(i);
					break;
				}
			}
			var file = new FileFactory(this.dirSave);
			file.append(this.destinationName);

			var fiStream = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
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
					'url': new DTA_URLManager(urls),
					'refPage': this.refPage.spec,
					'numIstance': 0,
					'mask': this.mask,
					'dirSave': this.originalDirSave,
					'description': desc,
					'ultDescription': ''
				});
			}
			if (downloads.length)
			{
				startnewDownloads(true, downloads);
			}
		} catch (ex) {
			Debug.dump("hml exception", ex);
		}
	},
	finishDownload: function() {
		Debug.dump("fd");
		// create final file pointer
		this.fileManager = new FileFactory(this.dirSave);
		this.fileManager.append(this.destinationName);

		this.totalSize = this.partialSize = this.getSize();
		this.setTreeCell("size", this.createDimensionString());
		this.setTreeCell("percent", "100%");
		this.setTreeProgress("completed", 100);

		this.isPassed = true;
		this.setTreeCell("status", _("complete"));
		popup();

		// Garbage collection
		this.chunks = [];
	},

	// XXX: revise
	buildFromMask: function(dir, mask) {
		try {
			var url = this.urlManager.usable;
			var uri = Cc['@mozilla.org/network/standard-url;1']
				.createInstance(Ci.nsIURL);
			uri.spec = url;

			// normalize slashes
			mask = mask
				.removeLeadingChar("\\").removeFinalChar("\\")
				.removeLeadingChar("/").removeFinalChar("/")
				.replace(/([\\/]{1,})/g, SYSTEMSLASH);

			if (dir) {
				mask = mask.substring(0, mask.lastIndexOf(SYSTEMSLASH));
				var replacedSlash = SYSTEMSLASH;
			} else {
				mask = mask.substring(mask.lastIndexOf(SYSTEMSLASH) + 1, mask.length);
				var replacedSlash = "-";
			}

			var uripath = uri.path.removeLeadingBackSlash();
			if (uripath.length) {
				uripath = uripath.substring(0, uri.path.lastIndexOf("/"))
					.removeFinalBackSlash()
					.replace(/\//g, replacedSlash);
			}
			
			var query = '';
			try {
				query = DTA_URLhelpers.decodeCharset(uri.query, url.originCharset);
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
				"\\*curl\\*": (uri.host + ((uripath=="")?"":(replacedSlash + uripath))),
				"\\*num\\*": makeNumber(this.numIstance),
				"\\*hh\\*": String(this.startDate.getHours()).formatTimeDate(),
				"\\*mm\\*": String(this.startDate.getMinutes()).formatTimeDate(),
				"\\*ss\\*": String(this.startDate.getSeconds()).formatTimeDate(),
				"\\*d\\*": String(this.startDate.getDate()).formatTimeDate(),
				"\\*m\\*": String(this.startDate.getMonth()+1).formatTimeDate(),
				"\\*y\\*": String(this.startDate.getFullYear())
			}

			for (i in replacements) {
				mask = mask.replace(new RegExp(i, "gi"), replacements[i]);
			}

			if (dir) {
				return this.dirSave + ((mask.removeBadChars().trim().length==0)?"":mask.removeBadChars().trim().addFinalSlash());
			}
			return mask.removeBadChars().removeFinalChar(".").trim();

		} catch(ex) {
			Debug.dump("buildFromMask():", ex);
		}

		if (dir) {
			return this.dirSave;
		}
		return this.destinationName;
	},

	checkFilenameConflict: function() {try {

		// pointer to destination
		var realDest = new FileFactory(this.dirSave);
		realDest.append(this.destinationName);

		var num = 0;
		var newDest = this.destinationName;
		while (isInProgress(this.dirSave + newDest, this) != -1 || realDest.exists()) {
			var newDest = createNumber(++num, this.destinationName); // ora i due sono diversi
			realDest = new FileFactory(this.dirSave);
			realDest.append(newDest);
		}

		// pointer to destination
		var realDest = new FileFactory(this.dirSave);
		realDest.append(this.destinationName);

		// Checks differ between moments
		// if it's running
		var maxUrlSize = 70; // set the max size limit of a URL string, after which the string will be trimmed

		var shortUrl = (this.urlManager.usable).cropCenter(maxUrlSize);
		var s = -1;
		if (this.is(RUNNING)) {
			if (realDest.exists()) {
				s = askForRenaming(
					_("alreadyexists", [this.destinationName, this.dirSave]) + " " + _("whatdoyouwith", [shortUrl]),
					{caption:_("reninto", [newDest]), value:0}, {caption:_("overwrite"), value:1}, {caption:_("skip"), value:2}
				);
			} else {
				var p = isInProgress(this.dirSave + this.destinationName, this);
				if (p != -1) {
					s = askForRenaming(
						_("samedestination", [shortUrl, this.destinationName, inProgressList[p].d.urlManager.url]) + " " + _("whatdoyou"),
						{caption:_("reninto", [newDest]), value:0}, {caption:_("skipfirst"), value:2}, {caption:_("cancelsecond"), value:3}
					);
				}
			}
		}
		// if it's completed, and we're going to build final file
		else if (this.is(COMPLETE) && !this.isPassed && realDest.exists()) {
			s = askForRenaming(
				_("alreadyexists", [this.destinationName, this.dirSave]) + " " + _("whatdoyoucomplete", [shortUrl]),
				{caption:_("reninto", [newDest]), value:0}, {caption:_("overwrite"), value:1}, {caption:_("cancel"), value:4}
			);
		}

		// Make the decision
		if (s>=0) switch (s) {
			case 0: {
				this.destinationName = newDest;
				break;
			}
			case 1: {
				realDest.remove(false);
				break;
			}
			case 2: {
				this.cancel(_("skipped"));
				break;
			}
			case 3: {
				inProgressList[p].d.cancel();
				break;
			}
			case 4: {
				this.cancel();
				break;
			}
		}

	} catch(e) {Debug.dump("checkFilenameConflict():", e);}
	},
	
	fail: function dd_fail(d, title, msg, state) {
		Debug.dump("failDownload invoked");
		
		this.cancel(state);
		
		playSound("error");

		switch (Prefs.alertingSystem) {
			case 1:
				AlertService.show(title, msg, false);
				break;
			case 0:
				alert(msg);
				break;
		}
	},

	cancel: function dd_cancel(message) {
		try {
			if (this.is(CANCELED)) {
				return;
			}			
			Debug.dump(this.fileName + ": canceled");
			this.visitors = new VisitorManager();

			if (this.isFirst) {
				Check.setFirstInQueue();
			}
			if (message == "" || !message) {
				message = _("canceled");
			}
			this.setTreeCell("status", message);
			this.setTreeProgress("canceled");

			if (this.is(COMPLETE)) {
				Stats.completedDownloads--;
			}
			else if (this.is(RUNNING)) {
				this.setPaused();
			}
			else {
					this.isPassed = true;
			}

			this.setPaused();

			this.state = CANCELED;
			Check.checkClose();
			popup();
		} catch(ex) {
			Debug.dump("cancel():", ex);
		}
	},

	resumeDownload: function () {
	
		function downloadChunk(download, start, end, header) {
			var chunk = new chunkElement(start, end, download);
			download.chunks.push(chunk);
			chunk.isRunning = true;
			download.state = RUNNING;
			chunk.download = new Download(download, chunk, header);
			if (header) {
				Debug.dump(download.fileName + ": Created Header Chunk Test (" + chunk.start + "-" + chunk.end + ")");
			}
			else {
				Debug.dump(download.fileName + ": Created chunk of range " + chunk.start + "-" + chunk.end);
			}
			download.setTreeCell("parts", 	(++download.activeChunks) + "/" + download.maxChunks);
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
				downloadChunk(this, 0, 0, true);
				return false;
			}
			
			// start some new chunks
			while (this.activeChunks < this.maxChunks) {
				// find biggest chunk
				
				var biggest = null;
				this.chunks.forEach(
					function (chunk) {
						if (chunk.remainder > MIN_CHUNK_SIZE * 2 && (!biggest || chunk.remainder > biggest.remainder)) {
							biggest = chunk;
						}
					}
				);
				
				// nothing found, break
				if (!biggest) {
					break;
				}
				var end = biggest.end;
				biggest.end = biggest.start + biggest.size + Math.floor(biggest.remainder / 2);
				downloadChunk(this, biggest.end + 1, end);
				rv = true;
			}

			// update ui
			return rv;
		}
		catch(ex) {
			Debug.dump("resumeDownload():", ex);
		}
		return false;
	},
	createDimensionString: function() {
		if (this.totalSize > 0) {
			return formatBytes(this.partialSize) + "/" + formatBytes(this.totalSize);
		}
		return formatBytes(this.partialSize) + "/" + "???";
	}

}

// --------* inProgressElement *--------
function inProgressElement(el) {
	this.d = el;
	this.lastBytes = el.partialSize;
	this.speeds = new Array();
}

var downloadList = new Array();
var inProgressList = new Array();

DTA_include('chrome://dta/content/dta/manager/alertservice.js');

// --------* Controlli di chiusura e avvio nuovi downloads *--------

var Check = {
	lastCheck: 0,
	lastDownloads: -1,
	haveToCheck: true,
	timerRefresh: 0,
	timerCheck: 0,
	isClosing: false,
	firstInQueue: -1,
	frequencyRefresh: 1500,
	frequencyCheck: 500,
	frequencyUpdateChunkGraphs: 500,
	lastSum: 0,

	refreshDownloadedBytes: function() {
		// update statusbar
		for (var i=0; i<inProgressList.length; i++)
			Stats.downloadedBytes+=inProgressList[i].d.partialSize;
		return Stats.downloadedBytes;
	},

	refreshGUI: function() {try{

		// Calculate global speed
		var sum = 0;
		for (var i=0; i<inProgressList.length; i++)
			sum+=inProgressList[i].d.partialSize;

		var speed = Math.round((sum - this.lastSum) * (1000 / this.frequencyRefresh));
		speed = (speed>0)?speed:0;

		this.lastSum = sum;

		// Refresh status bar
		$("status").label = (
			_("cdownloads", [Stats.completedDownloads, downloadList.length]) +
			" - " +
			_("cspeed") + " " + formatBytes(speed) + "/s"
		);

		// Refresh window title
		if (inProgressList.length == 1 && inProgressList[0].d.totalSize > 0) {
			document.title = (
				Math.round(inProgressList[0].d.partialSize / inProgressList[0].d.totalSize * 100) + "% - " +
				Stats.completedDownloads + "/" + downloadList.length + " - " +
				formatBytes(speed) + "/s - DownThemAll! - " + _("dip")
			);
		} else if (inProgressList.length > 0)
			document.title = (
				Stats.completedDownloads + "/" + downloadList.length + " - " +
				formatBytes(speed) + "/s - DownThemAll! - " + _("dip")
			);
		else
			document.title = Stats.completedDownloads + "/" + downloadList.length + " - DownThemAll!";

		var data = new Date();
		for (var i=0; i<inProgressList.length; i++) {
			var d = inProgressList[i].d;
			if (d.partialSize != 0 && d.is(RUNNING) && (data.getTime() - d.timeStart) >= 1000 ) {
				// Calculate estimated time
				if (d.totalSize > 0) {
					var remainingSeconds = Math.ceil((d.totalSize - d.partialSize) / ((d.partialSize - inProgressList[i].lastBytes) * (1000 / this.frequencyRefresh)));
					var hour = Math.floor(remainingSeconds / 3600);
					var min = Math.floor((remainingSeconds - hour*3600) / 60);
					var sec = remainingSeconds - min * 60 - hour*3600;
					if (remainingSeconds == "Infinity")
						d.setTreeCell("status", _("unavailable"));
					else {
						var s= hour>0?(hour+":"+min+":"+sec):(min+":"+sec);
						d.setTreeCell("status", String(s).formatTimeDate());
					}
				}
				var speed = Math.round((d.partialSize - inProgressList[i].lastBytes) * (1000 / this.frequencyRefresh));

				// Refresh item speed
				d.setTreeCell("speed", formatBytes(speed) + "/s");
				d.speeds.push(speed);
				if (d.speeds.length > 50)
					d.speeds.splice(0, 1);

				inProgressList[i].lastBytes = d.partialSize;
			}
		}
		this.timerRefresh = setTimeout("Check.refreshGUI();", this.frequencyRefresh);
	} catch(e) {Debug.dump("refreshGUI():", e);}
	},

	checkDownloads: function() {try {

		this.refreshDownloadedBytes();

		// se il numero di download e' cambiato, controlla.
		if (!this.haveToCheck && (this.lastDownloads != downloadList.length))
			this.haveToCheck = true;

		if (this.haveToCheck && inProgressList.length < Prefs.maxInProgress && !Check.isClosing) {
			this.lastDownloads = downloadList.length;
			if (Check.firstInQueue != -1)
				this.startNextDownload();
			else {
				if (this.setFirstInQueue() == -1)
					this.haveToCheck = false;
				else
					this.startNextDownload();
			}
		}
		this.checkClose();

		var data = new Date();
		for (var i=0; i<inProgressList.length; i++) {
			var d = inProgressList[i].d;

			// checks for timeout
			if ((isOpenedMessagebox == 0) && (data.getTime() - d.timeLastProgress) >= Preferences.getDTA("timeout", 300, true) * 1000) {
				if (d.isResumable) {
					d.setPaused();
					d.state = PAUSED;
					d.setTreeCell("status", _("timeout"));
					d.setTreeProgress("paused");
				} else
					d.cancel(_("timeout"));

				popup();
				Debug.dump("checkDownloads(): " + d.fileName + " in timeout");
			}
		}
		this.timerCheck = setTimeout("Check.checkDownloads();", this.frequencyCheck);
	} catch(e) {Debug.dump("checkDownloads():", e);}
	},

	checkClose: function() {
		try {
			this.refreshDownloadedBytes();

			if (
				!downloadList.length
				|| this.lastCheck == Stats.downloadedBytes
				|| downloadList.some(function(e) { return !e.isPassed; })
			) {
				return;
			}

			Debug.dump("checkClose(): All downloads passed correctly");
			this.lastCheck = Stats.downloadedBytes;

			playSound("done");

			// if windows hasn't focus, show FF sidebox/alerts
			if (Stats.completedDownloads > 0) {
				var stringa;
				if (Stats.completedDownloads > 0)
					stringa = _("suc");

				if (Prefs.alertingSystem == 1) {
					AlertService.show(_("dcom"), stringa, true, downloadList[0].dirSave);
				}
				else if (Prefs.alertingSystem == 0) {
					if (confirm(stringa + "\n "+ _("folder")) == 1) {
						try {
							OpenExternal.launch(downloadList[0].dirSave);
						}
						catch (ex){
							_("noFolder");
						}
					}
				}
			}

			// checks for auto-disclosure of window
			if (Preferences.getDTA("closedta", false) || Check.isClosing) {
				Debug.dump("checkClose(): I'm closing the window/tab");
				clearTimeout(this.timerCheck);
				clearTimeout(this.timerRefresh);
				sessionManager.save();
				self.close();
				return;
			}
			sessionManager.save();
		}
		catch(ex) {
			Debug.dump("checkClose():", ex);
		}
	},

	setFirstInQueue: function() {try {

	if (this.firstInQueue > downloadList.length-1) {
		this.firstInQueue = -1;
		return -1;
	}
	if (this.firstInQueue != -1) {
		downloadList[this.firstInQueue].isFirst = false;
		var oldInQueue = this.firstInQueue;
		var ind = this.firstInQueue;
		// until we find one..
		while ((oldInQueue == this.firstInQueue)&&(ind <= downloadList.length-2)) {
			ind++;
			var dow = downloadList[ind];
			if (dow.is(QUEUED) && !dow.hasToBeRedownloaded) {
				this.firstInQueue = ind;
				downloadList[this.firstInQueue].isFirst = true;
				return ind;
			}
		}
	} else {
		for (var i = 0; i<downloadList.length; i++) {
			var d = downloadList[i];
			// se non e' cancellato, non e' in pausa, non e' gia' completato ed e' in coda che aspetta
			if (d.is(QUEUED) && !d.hasToBeRedownloaded) {
				this.firstInQueue = i;
				downloadList[this.firstInQueue].isFirst = true;
				return i;
			}
		}
	}
	} catch(e) {Debug.dump("setFirstInQueue():", e);}
	this.firstInQueue = -1;
	return -1;
	},

	startNextDownload: function () {try {

		var i = this.firstInQueue;
		if (i == -1) {
			return;
		}

		var d = downloadList[i];

		d.setTreeCell("status", _("starting"));

		d.timeLastProgress = (new Date()).getTime();
		d.state = RUNNING;

		var flagAdd = true;
		for (var i = 0; i < inProgressList.length; ++i) {
			if (inProgressList[i].d == d) {
				flagAdd = false;
				break;
			}
		}
		if (flagAdd) {
			inProgressList.push(new inProgressElement(d));
			d.timeStart = (new Date()).getTime();
		}

		// start stuff
		if (!d.isStarted) {
			d.isStarted = true;
			Debug.dump("Let's start " + d.fileName);
		} else {
			Debug.dump("Let's resume " + d.fileName + ": " + d.partialSize);
		}
		d.resumeDownload();

		this.setFirstInQueue();

	} catch(e){Debug.dump("startNextDownload():", e);}
	}
}

function Download(d, c, headerHack) {
	
	this.d = d;
	this.c = c;
	this.isHeaderHack = headerHack;
	var uri = d.urlManager.getURL().url;
	var referrer = d.refPage;
	
	this._chan = this._ios.newChannelFromURI(this._ios.newURI(uri, null,null));
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
				http.setRequestHeader('Range', 'bytes=' + c.start + '-' + c.end, false);
			}
			if (typeof(referrer) == 'string') {
				referrer = this._ios.newURI(referrer, null, null);
			}
			http.referrer = referrer;
		}
		catch (ex) {
		
		}
	}
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
		Ci.nsIProgressEventSink
	],
	
	cantCount: 0,
	isPassedOnProgress: false,	
	
	QueryInterface: function(iid) {
			if (this._interfaces.some(function(i) { return iid.equals(i); })) {
				return this;
			}
			Debug.dump("NF: " + iid);
			throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	// nsISupportsWeakReference
	GetWeakReference: function( ) {
		return this;
	},
	// nsIWeakReference
	QueryReferent: function(uuid) {
		return this.QueryInterface(uuid);
	},
	// nsICancelable
	cancel: function(aReason) {
		Debug.dump("cancel");
		if (!aReason) {
			aReason = 0x804b0002 // NS_BINDING_ABORTED;
		}
		this._chan.cancel(aReason);
	},
	// nsIInterfaceRequestor
	getInterface: function(iid) {
		return this.QueryInterface(iid);
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
	prompt: function(aDialogTitle, aText, aPasswordRealm, aSavePassword, aDefaultText, aResult) {
		return this.authPrompter.prompt(
			aDialogTitle,
			aText,
			aPasswordRealm,
			aSavePassword,
			aDefaultText,
			aResult
		);
	},

	promptUsernameAndPassword: function(aDialogTitle, aText, aPasswordRealm, aSavePassword, aUser, aPwd) {
		return this.authPrompter.promptUsernameAndPassword(
			aDialogTitle,
			aText,
			aPasswordRealm,
			aSavePassword,
			aUser,
			aPwd
		);
	},
	promptPassword: function capPP(aDialogTitle, aText, aPasswordRealm, aSavePassword, aPwd) {
		return this.authPrompter.promptPassword(
			aDialogTitle,
			aText,
			aPasswordRealm,
			aSavePassword,
			aPwd
		);
	},
	
	// nsIStreamListener
  onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
		//Debug.dump("DA " + aCount);
		try {
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
	
	//nsIRequestObserver
	onStartRequest: function(aRequest, aContext) {
		Debug.dump('StartRequest');
		try {
			var c = this.c;
			var d = this.d;

			if (this.isPassedOnProgress) {
				throw new Components.Exception("WTF?");
			}
			this.isPassedOnProgress = true;
			Debug.dump("First ProgressChange for chunk ");
			try {
				var chan = aRequest.QueryInterface(Ci.nsIHttpChannel);
			} catch(ex) {
				// no-op
			}

			// if we don't have any HTTP Response (e.g. FTP link)
			if (!(chan instanceof Ci.nsIHttpChannel)) {
				Debug.dump(d.fileName + ": Error in istanceof chan... Probably FTP... forcing single chunk mode");

				// force single chunk mode
				this.isHeaderHack = false;
				d.maxChunks = 1;
				c.end = d.totalSize - 1;
				d.setTreeCell("parts", "1/1");
				this.cantCount = 1;

				// filename renaming
				d.destinationName = d.buildFromMask(false, d.mask);
				d.alreadyMaskedName = true;

				// target directory renaming
				d.dirSave = d.buildFromMask(true, d.mask);
				d.alreadyMaskedDir = true;

				d.setTreeCell("dir", d.dirSave);
				return;
			}
		
			if (chan.responseStatus >= 400) {
				// se si tratta di errore >= 400 blocchiamo e basta
				d.fail(
					_("error", [chan.responseStatus]),
					_("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]) + " " + _("sra", [chan.responseStatus]) + ": " + chan.responseStatusText,
					_("error", [chan.responseStatus])
				);
				sessionManager.save(d);
				return;
			}
			
			// not partial content altough we are multi-chunk
			if (chan.responseStatus != 206 && c.end != 0) {
				Debug.dump(d.fileName + ": Server returned a " + chan.responseStatus + " response instead of 206... Normal mode");
				vis = {visitHeader: function(a,b) { Debug.dump(a + ': ' + b); }};
				chan.visitRequestHeaders(vis);
				chan.visitResponseHeaders(vis);
				d.hasToBeRedownloaded = true;
				d.redownloadIsResumable = false;
				d.setPaused();
				return;
			}

			var visitor = null;
			try {
				visitor = d.visitors.visit(chan);
			}
			catch (ex) {
				Debug.dump("header failed! " + d.fileName, ex);
				// restart download from the beginning
				d.hasToBeRedownloaded = true;
				d.setPaused();
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
				d.isResumable = !visitor.dontacceptrange;

				Debug.dump("type: " + visitor.type);
				if (visitor.type && visitor.type.search(/application\/metalink\+xml/) != -1) {
					Debug.dump(chan.URI.spec + " iml");
					d.isMetalink = true;
					d.isResumable = false;
				}

				if (visitor.contentlength > 0) {
					d.totalSize = visitor.contentlength;
					c.end = d.totalSize - 1;
				} else {
					d.totalSize = 0;
					d.isResumable = false;
				}
				// Checks for available disk space.
				// XXX: l10n
				var tsd = d.totalSize;
				var nsd;
				if (Prefs.tempLocation)	{
					var tst = d.totalSize + (Preferences.getDTA("prealloc", true) ? d.totalSize : MAX_CHUNK_SIZE);
					nds = Prefs.tempLocation.diskSpaceAvailable
					if (nds < tst) {
						Debug.dump("There is not enought free space available on temporary directory, needed=" + tst + " (totalsize="+ d.totalSize +"), user=" + nds);
						d.fail(_("ndsa"), _("spacetemp"), _("freespace"));
						return;
					}
				}
				else {
					tsd = d.totalSize + (Preferences.getDTA("prealloc", true) ? d.totalSize : MAX_CHUNK_SIZE);
				}
				var realDest;
				try {
					var realDest = new FileFactory(d.dirSave);
					if (!realDest.exists()) realDest.create(Ci.nsIFile.DIRECTORY_TYPE, 0766);
				} catch(e) {
					Debug.dump("downloadChunk(): Could not move file or create directory on destination path: ", e);
					d.fail(_("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
					return;
				}
				nds = realDest.diskSpaceAvailable;
				if (nds < tsd) {
					Debug.dump("There is not enought free space available on destination directory, needed=" + tsd + " (totalsize="+ d.totalSize +"), user=" + nsd);
					d.fail(_("ndsa"), _("spacedir"), _("freespace"));
					return;
				}
				// if we are redownloading the file, here we can force single chunk mode
				if (d.hasToBeRedownloaded) {
					d.hasToBeRedownloaded = null;
					d.isResumable = false;
				}

				// filename renaming
				if (!d.alreadyMaskedName) {
					d.alreadyMaskedName = true;
					var newName = null;

					if (visitor.fileName && visitor.fileName.length > 0) {
						// if content disposition hasn't an extension we use extension of URL
						newName = visitor.fileName;
						if (visitor.fileName.lastIndexOf('.') == -1 && d.urlManager.url.getExtension()) {
							newName += '.' + d.urlManager.url.getExtension();
						}
					} else if (aRequest.URI.spec != d.url) {
						// if there has been one or more "moved content" header directives, we use the new url to create filename
						newName = aRequest.URI.spec.getUsableFileName();
					}

					// got a new name, so decode and set it.
					if (newName) {
						var charset = visitor.overrideCharset ? visitor.overrideCharset : d.urlManager.charset;
						d.fileName = DTA_URLhelpers.decodeCharset(newName, charset);
					}
					d.fileName = d.buildFromMask(false, "*name*.*ext*");

					if (Prefs.showOnlyFilenames) {
						d.setTreeCell("url", " " + d.fileName);
					}
					$(d.treeID).childNodes[0].childNodes[treeCells["url"]].setAttribute('src', d.icon);

					// aggiungiamo le opzioni di renaming a destinationName
					d.destinationName = d.buildFromMask(false, d.mask);
				}

				// target directory renaming
				if (!d.alreadyMaskedDir) {
					d.alreadyMaskedDir = true;
					d.dirSave = d.buildFromMask(true, d.mask);
					d.setTreeCell("dir", d.dirSave);
				}

				// in case of a redirect set the new real url
				if (this.url != aRequest.URI.spec) {
					d.urlManager.replace(this.url, new DTA_URL(aRequest.URI.spec, visitor.overrideCharset ? visitor.overrideCharset : d.urlManager.charset));
				}
				
				if (d.isResumable && d.totalSize > 2 * MIN_CHUNK_SIZE && d.maxChunks > 1) {
					d.resumeDownload();
				}
				else {
					// altrimenti il chunk di prova diventa quello definitivo
					Debug.dump(d.fileName + ": Multipart downloading is not needed/possible. isResumable = " + d.isResumable);
					d.maxChunks = 1;
					c.end = d.totalSize - 1;
				}
				this.isHeaderHack = false;
				
			} else {
				Debug.dump(d.fileName + ": Chunk " + c.start + "-" + + c.end + " started");
			}

			d.checkFilenameConflict();

			if (!d.totalSize && d.chunks.length == 1 && aProcessMax > 0) {
				d.totalSize = Number(aProcessMax);
			}
			else if (!d.totalSize) {
				this.cantCount = 1;
			}
			d.setTreeProgress("inprogress", 0);
			popup();
		} catch (ex) {
			Debug.dump("ss", ex);
		}
	},
	onStopRequest: function(aRequest, aContext, aStatusCode) {
		Debug.dump('StopRequest');
	
		// shortcuts
		var c = this.c;
		c.close();
		
		var d = this.d;

		if (c.size == 0) {
			c.remove();
			if (c.previous != -1) {
				d.chunks[c.previous].next = c.next;
			}
			if (c.next != -1) {
				d.chunks[c.next].previous = c.previous;
			}
		}
	
		// update flags and counters
		Check.refreshDownloadedBytes();
		d.refreshPartialSize();
		d.activeChunks--;
		d.setTreeCell("parts", 	d.activeChunks + "/" + d.maxChunks);

		// check if we're complete now
		if (!d.chunks.some(function(e) { return e.isRunning; })) {
			d.state = COMPLETE;
		}

		// routine for normal chunk
		Debug.dump(d.fileName + ": Chunk " + c.start + "-" + c.end + " finished.");

		// corrupted range: waiting for all the chunks to be terminated and then restart download from scratch
		if (d.hasToBeRedownloaded) {
			if (!d.is(RUNNING)) {
				Debug.dump(d.fileName + ": All old chunks are now finished, reDownload()");
				d.reDownload();
			}
			popup();
			sessionManager.save(d);
			Debug.dump("out2");
			return;
		}
	
		// check for corrupted ranges
		if (d.isResumable && c.next!=-1 && c.end >= d.chunks[c.next].start) {
			Debug.dump(d.fileName + ": Error on chunks range.. Redownload file in normal mode");
			d.hasToBeRedownloaded = true;
			d.redownloadIsResumable = false;
			if (!d.is(RUNNING)) {
				Debug.dump(d.fileName + ": All old chunks are finished, reDownload()");
				d.reDownload();
			}
			else {
				d.setPaused();
			}
			popup();
			sessionManager.save(d);
			Debug.dump("out3");
			return;
		}

		// ok, chunk passed all the integrity checks!

		// isHeaderHack chunks have their private call to removeFromInProgressList
		if (!d.is(RUNNING) && !d.imWaitingToRearrange) {
			d.setTreeCell("speed", "");
			d.removeFromInProgressList();
		}

		// rude way to determine disconnection: if connection is closed before download is started we assume a server error/disconnection
		if (!this.isPassedOnProgress && d.isResumable && !c.imWaitingToRearrange && !d.is(CANCELED, PAUSED)) {
			Debug.dump(d.fileName + ": Server error or disconnection (type 1)");
			d.setTreeCell("status", _("srver"));
			d.setTreeCell("speed", "");
			d.setTreeProgress("paused");
			d.state = PAUSED;
			d.setPaused();
		}
		// if the only possible chunk for a non-resumable download finishes and download is still not completed -> server error/disconnection
		else if (!d.isResumable && !d.is(COMPLETE, CANCELED, PAUSED)) {
			Debug.dump(d.fileName + ": Server error or disconnection (type 2)");
			d.fail(
				_("srver"),
				_("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]),
				_("srver")
			);
			sessionManager.save(d);
			Debug.dump("out4");
			return;
		}

		// if download is complete
		if (d.is(COMPLETE)) {
			Debug.dump(d.fileName + ": Download is completed!");
			d.moveCompleted(d.tmpFile);
		}
		else if (d.is(PAUSED) && Check.isClosing) {
			if (!d.isRemoved) {
				d.isPassed = true;
			}
			// reset download as it was never started (in queue state)
			if (!d.isResumable) {
				d.isStarted = false;
				d.setPaused();
				d.state = PAUSED;
				d.chunks = [];
				d.totalSize = 0;
				d.partialSize = 0;
				d.compression = false;
				d.activeChunks = 0;
				d.visitors = new VisitorManager();
			}
			Check.checkClose();
		}
		else if (d.is(RUNNING) && d.isResumable) {
			// if all the download space has already been occupied by chunks (= !resumeDownload)
			d.resumeDownload();
		}
		// if download has been canceled by user
		else if (d.is(CANCELED)) {
			Debug.dump(d.fileName + ": Download has been canceled.. erase chunk.");
			c.remove();

			if (!d.isRemoved) {
				d.isPassed = true;
				d.chunks = [];
			}
			Check.checkClose();
		}

		sessionManager.save(d);
		// refresh GUI
		popup();
	},
	
	// nsIProgressEventSink
  onProgress: function(aRequest, aContext, aProgress, aProgressMax) {
		//Debug.dump('Progress ' + aProgress + "/" + aProgressMax);
		try {

			// shortcuts
			var c = this.c;
			var d = this.d;

			if (d.is(PAUSED, CANCELED)) {
				this.cancel();
				if (d.is(CANCELED)) {
					c.remove();
				}
				return;
			}

			d.timeLastProgress = new Date().getTime();

			// update download tree row
			if (!d.is(CANCELED) && this.isPassedOnProgress) {
				d.refreshPartialSize();

				Check.refreshDownloadedBytes();

				if (this.cantCount != 1) {
					// basic integrity check
					if (d.partialSize > d.totalSize) {
						Debug.dump(d.fileName + ": partialSize > totalSize" + "(" + d.partialSize + "/" + d.totalSize + "/" + ( d.partialSize - d.totalSize) + ")");
						d.fail("Size mismatch", "Actual size of " + d.partialSize + " does not match reported size of " + d.totalSize, "Size mismatch");
						//d.hasToBeRedownloaded = true;
						//d.redownloadIsResumable = false;
						//d.setPaused();
						return;
					}
					
					d.setTreeProgress("inprogress", Math.round(d.partialSize / d.totalSize * 100));
					d.setTreeCell("percent", Math.round(d.partialSize / d.totalSize * 100) + "%");
				}
				else {
					d.setTreeCell("percent", "???");
					d.setTreeCell("status", _("downloading"));								
				}
				d.setTreeCell("size", d.createDimensionString());
			}
		}
		catch(ex) {
			Debug.dump("onProgressChange():", e);
		}
	},
	onStatus: function(aRequest, aContext, aStatus, aStatusArg) {}
};


function loadDown() {
	make_();
	tree = $("listDownload0");

	document.getElementById("dtaHelp").hidden = !("openHelp" in window);

	sessionManager.init();

	// update status and window title
	$("status").label = _("cdownloads", [Stats.completedDownloads, downloadList.length]);
	document.title = Stats.completedDownloads + "/" + downloadList.length + " - DownThemAll!";

	if ("arguments" in window) {
		startnewDownloads(window.arguments[0], window.arguments[1]);
	} else {
		tree.view.selection.currentIndex = tree.view.rowCount - 1;
	}

	try {
		clearTimeout(Check.timerCheck);
		clearTimeout(Check.timerRefresh);
		Check.checkDownloads();
		Check.refreshGUI();
	} catch (e) {}

	popup();
}

function cancelAll(pressedESC) {

	// if we have non-resumable running downloads...
	if (!Check.isClosing) {
		var rFlag = false;

		for (var i=0; i<downloadList.length; i++) {
			if (downloadList[i].isStarted && !downloadList[i].isResumable && downloadList[i].is(RUNNING)) {
				rFlag=true;
				break;
			}
		}
		if (rFlag) {
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
	}

	Check.isClosing = true;

	const removeAborted = Prefs.removeAborted;
	var allPassed = downloadList.every(
		function(d) {
			if (
				d.is(CANCELED)
				|| d.is(PAUSED)
				|| (d.isStarted && !d.is(RUNNING))
			) {
				d.isPassed = true;
			}
			if (d.isPassed || d.is(COMPLETE)) {
				return true;
			}

			// also canceled and paused without running joinings
			if (d.isStarted) {
				d.setPaused();
				d.state = PAUSED;
				d.setTreeCell("status", _("closing"));
				Debug.dump(d.fileName + " has to be stopped.");
			}
			else if (removeAborted) {
				removeFromList(i);
				return true;
			}
			else {
				d.state = PAUSED;
				d.isPassed = true;
				return true;
			}
			return false;
		}
	);

	// if we can close window now, let's close it
	if (allPassed) {
		Debug.dump("cancelAll(): Disclosure of window permitted");
		sessionManager.save();
		clearTimeout(Check.timerRefresh);
		clearTimeout(Check.timerCheck);
		self.close();
		return true;
	}

	Debug.dump("cancelAll(): We're waiting...");
	return false;
}

function startnewDownloads(notQueue, download) {

	var numbefore = tree.view.rowCount - 1;
	const DESCS = ['description', 'ultDescription'];
	var startDate = new Date();
	
	
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

		var d = new downloadElement(
			e.url,
			e.dirSave,
			e.numIstance,
			desc,
			e.mask,
			e.refPage
		);
		d.state = notQueue ? QUEUED : PAUSED;
		d.startDate = startDate;

		downloadList.push(d);
		populateListbox(d);
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

	Check.haveToCheck = true;

	// porto in visibile i file che si stanno scaricando
	var boxobject = tree.treeBoxObject;
	boxobject.QueryInterface(Ci.nsITreeBoxObject);
	if (download.length <= boxobject.getPageLength())
		boxobject.scrollToRow(tree.view.rowCount - boxobject.getPageLength());
	else
		boxobject.scrollToRow(numbefore);

	tree.view.selection.currentIndex = numbefore + 1;
	if (numbefore == -1) {
		Check.setFirstInQueue();
		downloadList[0].isFirst = true;
	}

	try {
		clearTimeout(Check.timerRefresh);
		clearTimeout(Check.timerCheck);
		Check.checkDownloads();
		Check.refreshGUI();
	} catch (e) {Debug.dump("startnewDownloads():", e);}

}

function populateListbox(d) {

	var lista = $("downfigli");

	var itemNode = document.createElement("treeitem");
	itemNode.setAttribute("value", d.urlManager.url);
	var id = d.urlManager.url + (new Date()).getTime() + String(Math.floor(10000 * (Math.random() % 1)));
	itemNode.setAttribute("id", id);
	d.treeID = id;

	var treeRow = document.createElement("treerow");

	var nomefile = document.createElement("treecell");

	if (Prefs.showOnlyFilenames)
		nomefile.setAttribute("label", " " + d.fileName);
	else
		nomefile.setAttribute("label", " " + d.urlManager.url);

	nomefile.setAttribute('src', d.icon);
	nomefile.setAttribute("ref", "task");

	var per = document.createElement("treecell");

	var per1 = document.createElement("treecell");
	per1.setAttribute("mode", "normal");
	per1.setAttribute("ref", "pct");

	var dim = document.createElement("treecell");
	dim.setAttribute("ref", "dim");

	var time = document.createElement("treecell");
	time.setAttribute("ref", "time");
	var speed = document.createElement("treecell");
	speed.setAttribute("ref", "speed");
	speed.setAttribute("label", "");

	var path = document.createElement("treecell");
	path.setAttribute("label", d.dirSave);
	path.setAttribute("ref", "path");

	var mask = document.createElement("treecell");
	mask.setAttribute("label", d.mask);
	mask.setAttribute("ref", "mask");

	var parts = document.createElement("treecell");
	parts.setAttribute("label", (d.maxChunks != null)?("0/"+d.maxChunks):"");

	if (d.is(COMPLETE)) {
			time.setAttribute("label", _("complete"));
			per1.setAttribute("properties", "completed");
	} else if (d.is(PAUSED)) {
			time.setAttribute("label", _("paused"));
			per1.setAttribute("properties", "paused");
	} else if (d.is(CANCELED)) {
			time.setAttribute("label", _("canceled"));
			per1.setAttribute("properties", "canceled");
	} else {
			time.setAttribute("label", _("inqueue"));
			per1.setAttribute("properties", "queued");
	}

	if (d.partialSize != 0 && d.totalSize != 0) {
			dim.setAttribute("label", d.createDimensionString());
			per1.setAttribute("value", Math.round(d.partialSize / d.totalSize * 100));
			per.setAttribute("label", Math.round(d.partialSize / d.totalSize * 100) + "%");
	} else {
			dim.setAttribute("label", "N/A");
			per1.setAttribute("value", 0);
			per.setAttribute("label", "0%");
	}

	treeRow.appendChild(nomefile);
	treeRow.appendChild(per);
	treeRow.appendChild(per1);
	treeRow.appendChild(dim);
	treeRow.appendChild(time);
	treeRow.appendChild(parts);
	treeRow.appendChild(mask);
	treeRow.appendChild(path);
	treeRow.appendChild(speed);

	itemNode.appendChild(treeRow);
	lista.appendChild(itemNode);
	lista.addEventListener("dblclick", FileHandling.openFile, true);
}

function isInProgress(path, d) {
	for (var x=0; x<inProgressList.length; x++)
		if ((inProgressList[x].d.dirSave + inProgressList[x].d.destinationName) == path && d != inProgressList[x].d)
			return x;
	return -1;
}

function askForRenaming(t, s1, s2, s3) {
	var scelta;

	if (Prefs.onConflictingFilenames == 3 && Prefs.askEveryTime) {

		var passingArguments = new Object();
		passingArguments.text = t;
		passingArguments.s1 = s1;
		passingArguments.s2 = s2;
		passingArguments.s3 = s3;

		isOpenedMessagebox++;
		window.openDialog("chrome://dta/content/dta/dialog.xul","_blank","chrome, centerscreen, resizable=no, dialog=yes, modal=yes, close=no, dependent=yes", passingArguments);
		isOpenedMessagebox--;

		// non faccio registrare il timeout
		inProgressList.forEach(function(o){o.d.timeLastProgress=(new Date()).getTime()});

		Prefs.sessionPreference = scelta = passingArguments.scelta;
		Prefs.askEveryTime = (passingArguments.temp==0)?true:false;

	} else {

		if (Prefs.onConflictingFilenames == 3)
			scelta = Prefs.sessionPreference;
		else
			scelta = Prefs.onConflictingFilenames;
	}
	return scelta;
}

function makeNumber(rv, digits) {
	rv = new String(rv);
	if (typeof(digits) != 'number') {
			digits = 3;
	}
	while (rv.length < digits) {
		rv = '0' + rv;
	}
	return rv;
}

//--> crea un numero con tot zeri prima, da migliorare
function createNumber(number, destination) {
	var stringa = makeNumber(number);
	var re = /(\.[^\.]*)$/i;
	var find = re.exec(destination);
	if (find != null)
			destination = destination.replace(/(\.[^\.]*)$/, "_" + stringa + find[0]);
	else
			destination = destination + "_" + stringa;

	return destination;
}

// ---------* Parte relativa a pause, resume, cancel e context in generale *----------

//--> disabilita le voci nella context non applicabili ai file selezionati
function popup() {
try {
	var objects = new Array();

	var rangeCount = tree.view.selection.getRangeCount();
		for(var i=0; i<rangeCount; i++) {
		var start = {}; var end = {};
		tree.view.selection.getRangeAt(i,start,end);
		for(var c=start.value; c<=end.value; c++)
			objects.push(downloadList[c]);
	}

	var enableObj = function(o) {o.setAttribute("disabled", "false");}
	var disableObj = function(o) {o.setAttribute("disabled", "true");}

	// disable all commands by default
	var context = $("popup");
	var mi = context.getElementsByTagName('menuitem');
	for (var i = 0; i < mi.length; ++i) {
		disableObj(mi[i]);
	}

	var context = $("tools");
	for (var i=0; i<context.childNodes.length; i++) {
		var el = context.childNodes.item(i);
		if (el.setAttribute) disableObj(el);
	}
	$("tooladd", "tooldonate", 'misc', 'prefs').forEach(enableObj);

	if (tree.view.rowCount > 0)
		$("removeCompleted", "selectall", "selectinv").forEach(enableObj);

	if (objects.length==0) return;

	for (var c=0; c<objects.length; c++) {
		var d = objects[c];

		if (!d || typeof(d) != "object") continue;

		// se non e' cancellato, non e' in pausa, non e' completato,
		// e se e' un file e' gia' iniziato
		if ((d.is(RUNNING) && d.isResumable) || d.is(QUEUED)) {
			$("pause", "toolpause").forEach(enableObj);
		}

		// se non e' cancellato, e' in pausa, non e' completato,
		// e se e' un file e' gia' iniziato
		if (!d.is(RUNNING, QUEUED, COMPLETE)) {
			$("play", "toolplay").forEach(enableObj);
		}
		
		if (!d.is(CANCELED)) {
			$("cancel", "toolcancel").forEach(enableObj);
		}

		if (d.is(COMPLETE)) {
			$('folder', 'launch', 'delete').forEach(enableObj);
		}
		
		if (!d.is(CANCELED, COMPLETE) && (!d.is(RUNNING) || d.isResumable)) {
			if (d.activeChunks > 1) {
				enableObj($("removechunk"));
			}
			if (d.activeChunks < 9) {
				enableObj($("addchunk"));
			}
		}
	}

 	$("movetop", "toolmovetop", "movebottom", "toolmovebottom", "moveup",
		"toolmoveup", "movedown", "toolmovedown", "info", "remove").forEach(enableObj);

} catch(e) {Debug.dump("popup()", e)}
}

function pauseResumeReq(pauseReq) {
try {
	var rangeCount = tree.view.selection.getRangeCount();
	var firstFlag = false;

	for(var i=0; i<rangeCount; i++) {
		var start = {};
		var end = {};
		tree.view.selection.getRangeAt(i,start,end);

		// ciclo gli elementi selezionati
		for(var c=start.value; c<=end.value; c++) {
			var d = downloadList[c];
			if (pauseReq) {
				if (d.is(QUEUED) || (d.is(RUNNING) && d.isResumable)) {
					d.setTreeCell("status", _("paused"));
					d.setTreeCell("speed", "");
					d.setTreeProgress("paused");

					if (d.isFirst) Check.setFirstInQueue();

					d.state = PAUSED;
					d.setPaused();
				}
			} else {
				// se e' effettivamente da resumare
				if (d.is(PAUSED, CANCELED)) {
					firstFlag = true;
					d.state = QUEUED;
					d.isPassed = false;
					d.setTreeCell("status", _("inqueue"));
					d.setTreeProgress("queued");
				}
				Check.haveToCheck = true;
				if (((Check.firstInQueue == -1) || (Check.firstInQueue > c)) && firstFlag) {
					if (Check.firstInQueue != -1) downloadList[Check.firstInQueue].isFirst = false;
					Check.firstInQueue = c;
					downloadList[c].isFirst = true;
				}
			}
		}
	}
	popup();
} catch(e) {Debug.dump("pauseResumeReq()", e)}
}

//--> attivato dal click su context o toolbar
function cancelPopup() {
	var sel = tree.view.selection;
	var rangeCount = sel.getRangeCount();

	for(var i=rangeCount-1; i>=0; i--) {
		var start = {};
		var end = {};
		tree.view.selection.getRangeAt(i,start,end);
		// ciclo gli elementi selezionati
		for(var c=end.value; c>=start.value; c--) {
			// se e' effettivamente da cancellare
			downloadList[c].cancel();
		}
	}
}

function removeFromList() {
	var index = -1;
	if (arguments.length) {
		// multi-delete
		if (arguments[0] instanceof Array) {

			var dellist = arguments[0];
			// sort desc
			dellist.sort(function(a,b) { return b - a; });
			
			sessionManager.beginUpdate();			
			dellist.forEach(removeElement);
			sessionManager.endUpdate();

			popup();
			return;
		}
		index = arguments[0];
	};
	
	// remove selection
	if (index < 0) {
		var start = {}, end = {}, rangeCount = tree.view.selection.getRangeCount();
		var list = new Array();
		for (var i = 0; i < rangeCount; ++i) {
			tree.view.selection.getRangeAt(i, start, end);
			for (var c = start.value; c <= end.value; ++c) {
				list.push(c);
			}
		}
		removeFromList(list);
		return;
	}

	// normal remove
	removeElement(index);
	popup();
}

function removeCompleted() {
	sessionManager.beginUpdate();
	for (var i=downloadList.length-1; i>=0; i--) {
		if (downloadList[i].is(COMPLETE)) {
			removeElement(i);
		}
	}
	sessionManager.endUpdate();
}

function removeElement(index) {
	var d = downloadList[index];
	if (d.isFirst) {
		Check.setFirstInQueue();
	}
	else if (index < Check.firstInQueue) {
		Check.firstInQueue--;
	}
	setRemoved(d);
	sessionManager.deleteDownload(d);
	downloadList.splice(index, 1);
}


function setRemoved(d) {
	try {
		d.isRemoved = true;

		$("downfigli").removeChild($(d.treeID));
		if (d.is(COMPLETE)) {
			Stats.completedDownloads--;
		}

		if (!d.isStarted || d.is(COMPLETE)) {
			d.isPassed = true;
		} else {
			if (d.is(RUNNING)) {
				d.setPaused();
			} else if(!d.isPassed) {
				d.isPassed = true;
			}
			d.setPaused();
		}

		d.state = CANCELED;
		d.isPassed = false;
	} catch(e) {
		Debug.dump("setRemoved():", e);
	}
	Check.checkClose();
}

function getInfo() {

	// store all selected downloads
	var rangeCount = tree.view.selection.getRangeCount();
	var t = new Array();
	for (var i=rangeCount-1; i>=0; i--) {
		var start = {}, end = {};
		tree.view.selection.getRangeAt(i, start, end);
		for (var c = end.value; c >= start.value; c--)
			t.push(downloadList[c]);
	}
	// pass them to info.xul
	if (t.length > 0)
	{
		window.openDialog("chrome://dta/content/dta/info.xul","_blank","chrome, centerscreen, dialog=no", t, this);
	}
}

//--> Richiamata dal context, muove la selezione corrente in cima o al fondo della tree
function moveTop(top) {
	try {
		var start;
		var end;
		var datas = new Array();
		var rangeCount = tree.view.selection.getRangeCount();

		if (top) { // se top, ordino in maniera decrescente
			for (var i=rangeCount-1; i>=0; i--) {
				start = {};	end = {};
				tree.view.selection.getRangeAt(i, start, end);
				for (var c=end.value; c>=start.value; c--) {
					datas.push(c);
				}
			}
		}	else {
			for (var i=0; i<rangeCount; i++) {
				start = {};	end = {};
				tree.view.selection.getRangeAt(i, start, end);
				for (var c=start.value; c<=end.value; c++) {
					datas.push(c);
				}
			}
		}

		tree.view.selection.clearSelection();

		for (var i=0; i<datas.length; i++) {
			var oldfirst = downloadList[Check.firstInQueue];
			if (top == false)
				var position = datas[i]-i;
			else
				var position = datas[i]-(-i);
			var t = downloadList [position];
			downloadList.splice(position, 1);
			if (top==true)
				downloadList.splice(0, 0, t);
			else
				downloadList.splice(downloadList.length, 0, t);

			if (top) { // top
				var d = downloadList[0];
				if ((0 <= Check.firstInQueue)&& d.is(QUEUED)) {
					d.isFirst = true;
					oldfirst.isFirst = false;
					Check.firstInQueue = 0;
				}
				else if (datas[i] > Check.firstInQueue && 0 <= Check.firstInQueue) Check.firstInQueue++;
			}
			else {
				var beforePos = downloadList.length; // bottom
				if (datas[i] == Check.firstInQueue) {
					for (var dex = datas[i]; dex < beforePos; dex++) {
						var d = downloadList[dex];
						if (d.is(QUEUED)) {
							d.isFirst = true;
							oldfirst.isFirst = false;
							Check.firstInQueue = dex;
							break;
						}
					}
				}
				else if (datas[i]<Check.firstInQueue && beforePos > Check.firstInQueue )  {
					Check.firstInQueue--;
				}
			}

			if(beforePos<=(downloadList.length-1)) { // se non devo spostare l'elemento nell'ultima riga
				var before = tree.view.getItemAtIndex(beforePos);
				$("downfigli").insertBefore(tree.view.getItemAtIndex(position), before);
				tree.view.selection.rangedSelect(beforePos, beforePos, true);
			}
			else {
				$("downfigli").appendChild(tree.view.getItemAtIndex(position));
				//$("downfigli").removeChild(tree.view.getItemAtIndex(datas[i]));
				tree.view.selection.rangedSelect(beforePos-1, beforePos-1, true);
			}

		}
	} catch(e) {
		Debug.dump("moveTop():", e);
	}
}

//--> Richiamata dal context, muove di n posizioni la selezione corrente
// pos < 0 equivale a spostare verso l'alto di pos posizioni
function move(pos) {
	try {
		var start;
		var end;
		var datas = new Array();
		var rangeCount = tree.view.selection.getRangeCount();

		if (pos < 0) { // se si sale, ordino le posizioni in maniera crescente, se si scende decrescente
			for (var i=0; i<rangeCount; i++) {
				start = {};	end = {};
				tree.view.selection.getRangeAt(i, start, end);
				for (var c=start.value; c<=end.value; c++) {
					datas.push(c);
				}
			}
		}	else {
			for (var i=rangeCount-1; i>=0; i--) {
				start = {};	end = {};
				tree.view.selection.getRangeAt(i, start, end);
				for (var c=end.value; c>=start.value; c--) {
					datas.push(c);
				}
			}
		}

		tree.view.selection.clearSelection();

		for (var i=0; i<datas.length; i++) {
			var oldfirst = downloadList[Check.firstInQueue];
			var t = downloadList[datas[i]];
			downloadList.splice(datas[i], 1);
			downloadList.splice(datas[i] + pos, 0, t);

			if (datas[i] + pos < 0) break;
			if (pos < 0) { // se si sale
				var beforePos = datas[i] + pos;
				var d = downloadList[beforePos];
				if ((beforePos <= Check.firstInQueue)&&d.is(QUEUED)) {
					oldfirst.isFirst = false;
					Check.firstInQueue = beforePos;
					downloadList[beforePos].isFirst = true;
				}
				else if (datas[i] > Check.firstInQueue && beforePos <= Check.firstInQueue) Check.firstInQueue++;
			}
			else {
				var beforePos = datas[i] + pos + 1; // se si scende
				if (datas[i] == Check.firstInQueue) {
					for (var dex = datas[i]; dex < beforePos; dex++) {
						var d = downloadList[dex];
						if (d.is(QUEUED)) {
							oldfirst.isFirst = false;
							Check.firstInQueue = dex;
							d.isFirst = true;
							break;
						}
					}
				}
				else
				if ( datas[i]<Check.firstInQueue && beforePos > Check.firstInQueue ) Check.firstInQueue--;
			}

			if(beforePos<=(downloadList.length-1)) { // se non devo spostare l'elemento nell'ultima riga
				var before = tree.view.getItemAtIndex(beforePos);
				$("downfigli").insertBefore(tree.view.getItemAtIndex(datas[i]), before);
			}
			else {
				$("downfigli").appendChild(tree.view.getItemAtIndex(datas[i]));
				//$("downfigli").removeChild(tree.view.getItemAtIndex(datas[i]));
			}
			tree.view.selection.rangedSelect(datas[i] + pos, datas[i] + pos, true);
		}
	}
	catch(e) {Debug.dump("move():", e);}
}

DTA_include('chrome://dta/content/dta/manager/filehandling.js');

//--> Richiamata dal context, seleziona tutto
function selectAll() {
	tree.view.selection.selectAll();
}

//--> Richiamata dal context, inverte la selezione
function selectInv() {
	for (var i = 0, e = tree.view.rowCount; i < e; ++i) {
		tree.view.selection.toggleSelect(i);
	}
}

//--> Richiamata dal context, aumenta o diminuisce di uno il numero di chunks
function addChunk(add) {
	var rangeCount = tree.view.selection.getRangeCount();

	for (var i = 0; i < rangeCount; ++i) {
		var start = {};
		var end = {};
		tree.view.selection.getRangeAt(i,start,end);

		// ciclo gli elementi selezionati
		for (var c = start.value; c <= end.value; ++c) {
			if (!add && downloadList[c].maxChunks > 1) {
				downloadList[c].maxChunks--;
			}
			else if (add  && downloadList[c].maxChunks < 10) {
				downloadList[c].maxChunks++;
				downloadList[c].resumeDownload();
			}
			downloadList[c].setTreeCell("parts", downloadList[c].activeChunks + "/" + downloadList[c].maxChunks);
		}
	}
}

DTA_include('chrome://dta/content/dta/manager/sessionmanager.js');

function tooltipInfo(event) {
try {
		var result;
		var row = new Object;
		var column = new Object;
		var part = new Object;


		var boxobject = tree.treeBoxObject;
		boxobject.QueryInterface(Ci.nsITreeBoxObject);
		boxobject.getCellAt(event.clientX, event.clientY, row, column, part);

		if (row.value == -1)
				return false;

		var arrayComp = Cc['@mozilla.org/supports-array;1'].createInstance();
		var properties = arrayComp.QueryInterface(Ci.nsISupportsArray);
		tree.view.getCellProperties(row, column, properties);

		var n = row.value;
		$("infoURL").value = downloadList[n].urlManager.url;
		$("infoDest").value = downloadList[n].dirSave + downloadList[n].destinationName;

		Prefs.currentTooltip = downloadList[n];
		updateChunkCanvas();
		updateSpeedCanvas();

		return true;
} catch(e) { Debug.dump("tooltipInfo():", e); }
return false;
}

function updateSpeedCanvas() { try {

	var file = Prefs.currentTooltip;
	if (file==null) return;

	var d = $("drawSpeed").getContext("2d");

	var normal = d.createLinearGradient(0,0,0,16);
	normal.addColorStop(0, 'rgba(255,255,255,50)');
	normal.addColorStop(1, '#CCE8F2');

	var prog = d.createLinearGradient(0,0,0,16);
	prog.addColorStop(0, '#00D2E0');
	prog.addColorStop(1, '#009DA6');

	d.clearRect(0,0,300,20);
	d.fillStyle = normal;
	d.fillRect(0,0,300,20);

	if (file.speeds.length>0) {
		var maxH = 0;
		var minH = 1/0; // Infinity
		for (var i=0; i<file.speeds.length; i++) {
			if (file.speeds[i] > maxH) maxH = file.speeds[i];
			if (file.speeds[i] < minH) minH = file.speeds[i];
		}
		if (maxH!=0) {
			minH *= 0.3;
			var w = Math.round(300/50);
			var u = 20/((maxH - minH)*1.1);
			d.fillStyle=prog;

			d.beginPath();
			d.moveTo(0, 20);
			for (var i=0; i<file.speeds.length; i++)
				d.lineTo(i*w, 20-Math.round(u*(file.speeds[i] - minH)));
			d.lineTo((i-1)*w, 20);
			d.fill();
		}
	}

	setTimeout("updateSpeedCanvas()", Check.frequencyRefresh);

} catch(e) { Debug.dump("updateSpeedCanvas(): ", e); }
}

function updateChunkCanvas() { try {

	var file = Prefs.currentTooltip;
	if (!file) {
		return;
	}

	var d = $("drawChunks").getContext("2d");

	d.clearRect(0,0,300,20);

	var prog = d.createLinearGradient(0,0,0,16);
	prog.addColorStop(0, 'rgba(96,165,1,255)');
	prog.addColorStop(1, 'rgba(123,214,1,255)');

	var compl = d.createLinearGradient(0,0,0,16);
	compl.addColorStop(0, 'rgba(13,141,15,255)');
	compl.addColorStop(1, 'rgba(0,199,56,255)');

	var cancel = d.createLinearGradient(0,0,0,16);
	cancel.addColorStop(0, 'rgba(151,58,2,100)');
	cancel.addColorStop(1, 'rgba(255,0,0,100)');

	var normal = d.createLinearGradient(0,0,0,16);
	normal.addColorStop(0, 'rgba(255,255,255,50)');
	normal.addColorStop(1, '#DBF2CC');

	d.fillStyle = normal;
	d.fillRect(0,0,300,20);

	if (file.is(COMPLETE)) {
		d.fillStyle = compl;
		d.fillRect(0,0,300,20);
	} else if (file.is(CANCELED)) {
		d.fillStyle = cancel;
		d.fillRect(0,0,300,20);
	} else if (file.isStarted) {
		file.chunks.forEach(
			function(c) {
				d.fillStyle = prog;
				d.fillRect(Math.ceil(c.start / file.totalSize*300), 0, Math.ceil(c.size / file.totalSize * 300), 20);
			}
		);
	}

	setTimeout("updateChunkCanvas()", Check.frequencyUpdateChunkGraphs);

} catch(e) { Debug.dump("updateChunkCanvas(): ", e); }
}

function stopCanvas() {Prefs.currentTooltip=null;}
