/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * Contributers:
 *   Nils Maier <MaierMan@web.de>
 *
 * ***** END LICENSE BLOCK ***** */

var strbundle;
// true if window has focus
var winFocus = false;
// true if some dialog.xul is opened
var isOpenedMessagebox = 0;	
// true if some FF sidebox is shown
var alerting = false;

const cc = Components.classes;
const FileFactory = new Components.Constructor("@mozilla.org/file/local;1", "nsILocalFile", "initWithPath");

var downPrefs = {
	

};

var Prefs = {
	// default values
	showOnlyFilenames : true,
	alertingSystem : 0,
	
	// conflict filenames preference for this session (-1 not setted)
	askEveryTime : true,
	sessionPreference : -1,
	onConflictingFilenames : 3,
	
	maxInProgress : 5,
	maxChunks : 5,
	tempLocation : null,
	
	onClosingSaveAborted : true,
	onClosingSaveCompleted : true,
	onClosingSaveCanceled : true,
	
	minChunkSize : 200 * 1024, 
	// does NOT affect the memory usage as it will be written out directly and synchronously.
	maxChunkSize :  10 * 1024 * 1024,
	maxMemoryUsage : 5 * 1024 * 1024,
	
	currentTooltip : null,
	
	refresh : function() {
		this.onClosingSaveAborted = !Preferences.getDTA("removeaborted", false);
		this.onClosingSaveCompleted = !Preferences.getDTA("removecompleted", true);
		this.onClosingSaveCanceled = !Preferences.getDTA("removecanceled", false);
		this.maxInProgress = Preferences.getDTA("ntask", 5);
		this.showOnlyFilenames = Preferences.getDTA("showOnlyFilenames", true);
		this.onConflictingFilenames = Preferences.getDTA("existing", 3);
		
		if (Preferences.get("saveTemp", true)) {
			try {
				this.tempLocation = Preferences.getMultiByteDTA("tempLocation", '');
				if (this.tempLocation == '') {
					this.tempLocation = cc["@mozilla.org/file/directory_service;1"]
						.getService(Components.interfaces.nsIProperties)
						.get("TmpD", Components.interfaces.nsIFile);
					this.tempLocation.append("dta");
				} else {
					this.tempLocation = new FileFactory(this.tempLocation);
				}
			} catch (ex) {
				this.tempLocation = null;
				// XXX: error handling
			}
		}
		
		this.alertingSystem = Preferences.getDTA("alertbox", (SYSTEMSLASH == '\\') ? 1 : 0);
		this.maxChunks = Preferences.getDTA("maxchunks", 5);
		// overwrite preference only if >
		var current = Preferences.get("network.http.max-persistent-connections-per-server", this.maxInProgress * this.maxChunks + 2);
		if (current < this.maxInProgress * this.maxChunks)
			Preferences.set("network.http.max-persistent-connections-per-server", this.maxInProgress * this.maxChunks + 2);
	}
}

// --------* Statistiche *--------
var Stats = {
	totalDownloads : 0,
	
	// Debug this crap,
	_completedDownloads: 0,
	get completedDownloads() { return this._completedDownloads; },
	set completedDownloads(nv) { if (0 > (this._completedDownloads = nv)) { throw "Stats::Completed downloads less than 1"; } },
	
	zippedToWait : 0,
	downloadedBytes : 0,
	passedNumber : 0
}

function DTA_URLManager(urls) {
	this._urls = [];
	this._idx = 0;
	
	if (urls instanceof Array) {
		this.initByArray(urls);
	}
	else if (urls instanceof Node) {
			this.initByNode(urls);
	}
	else if (urls) {
		throw "Feeding the URLManager with some bad stuff is usually a bad idea!";
	}
}
DTA_URLManager.prototype = {
	_sort: function(a,b) {
		const rv = a.preference - b.preference;
		return rv ? rv : (a.url < b.url ? -1 : 1);
	},
	
	initByNode: function um_initByNode(node) {
		var nodes = node.getElementsByTagName('url');
		for (var i = 0; i < nodes.length; ++i)
		{
			var n = nodes[i];
			this.add(new DTA_URL(
				n.getAttribute('uri'),
				n.getAttribute('charset'),
				n.getAttribute('usable'),
				n.getAttribute('preference')
			));
		}
		this._urls.sort(this._sort);
		this._usable = this._urls[0].usable;
	},
	initByArray: function um_initByArray(urls) {
		for (var i = 0; i < urls.length; ++i) {
			this.add(urls[i]);
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
		if (typeof(idx) != 'number')
		{
			this._idx--;
			if (this._idx < 0) {
				this._idx = this._urls.length - 1;
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
	replace: function um_replace(url, newUrl) {
		this._urls.forEach(function(u,i,a){ if (u.url == url) u = newURL; });
	},
	save: function um_save(node) {
		for (var i = 0; i < this._urls.length; ++i)
		{
			var url = this._urls[i];
			var n = node.ownerDocument.createElement("url");
			n.setAttribute('uri', url.url);
			n.setAttribute('charset', url.charset);
			n.setAttribute('usable', url.usable);
			n.setAttribute('preference', url.preference);
			node.appendChild(n);
		}
	}
};

const headerCmpKeys = {
	'etag': true, // must not be modified from 200 to 206: http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.2.7
	//'content-length': false,
	'content-type': true,
	'last-modified': true, // may get omitted later, but should not change
	'content-encoding': true // must not change, or download will become corrupt.
};

function Visitor() {
	// sanity check
	if (arguments.length != 1 || !('attributes' in arguments[0])) return;

	var nodes = arguments[0].getElementsByTagName('header');
	if (!nodes.length) {
		throw "no headers";
	}
	try	{
		for (var i = 0; i < nodes.length; ++i) {
			var name = nodes[i].getAttribute('name');
			if (!name || !(name in headerCmpKeys))
			{
				continue;
			}
			this[name] = nodes[i].getAttribute('value');
		}
	} catch (e) {
		Debug.dump("hrhv::ctor", e);
	}
}

Visitor.prototype = {
	type : null,
	overrideCharset: null,
	encoding : null,
	fileName : null,
	dontacceptrange : false,
	contentlength : 0,
	
	QueryInterface: function(aIID) {
		if (
			aIID.equals(Components.interfaces.nsISupports)
			|| aIID.equals(Components.interfaces.nsIHttpHeaderVisitor)
		) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	visitHeader : function(aHeader, aValue) {try {
	
		const header = aHeader.toLowerCase();
		switch (header) {
			case 'content-type':
			{
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
				this.dontacceptrange = (aValue.toLowerCase().indexOf('none') >= 0);
				Debug.dump("acceptrange = " + aValue.toLowerCase());
			break;

			case 'content-length':
				this.contentlength = Number(aValue);
			break;

			case 'content-range':
				var dim = aValue.substring(aValue.lastIndexOf('/') + 1, aValue.length);
				if (dim.length>0 && dim.lastIndexOf('*')==-1)
					this.contentlength = Number(dim);
			break;
		}

		if (header in headerCmpKeys)
			this[header] = aValue;
		
		if ((header == 'content-type' || header == 'content-disposition') && this.fileName == null) {
			// we have to handle headers like "content-disposition: inline; filename='dummy.txt'; title='dummy.txt';"
			var value = aValue.match(/file(?:name)?=(["']?)([^\2;]+)\2(?:;.+)?/i);
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
	compare : function vi_compare(v)	{
		if (!(v instanceof Visitor)) {
			return;
		}

		for (x in headerCmpKeys) {
			// we don't have this header
			if (!(x in this)) {
				continue;
			}
			// v does not have this header
			else if (!(x in v)) {
				// allowed to be missing?
				if (headerCmpKeys[x]) {
					continue;
				}
				Debug.dump(x + " missing");
				throw (x + " is missing");
			}
			// header is there, but differs
			else if (this[x] != v[x]) {
				Debug.dump(x + " nm: [" + this[x] + "] [" + v[x] + "]");
				throw ("Header " + x + "doesn't match");
			}
		}
	},
	save : function vi_save(node) {
		// salva su file le informazioni sugli headers
		for (x in headerCmpKeys) {
			if (!(x in this)) {
				continue;
			}
			var head = node.ownerDocument.createElement('header');
			head.setAttribute('name', x);
			head.setAttribute('value', this[x]);
			node.appendChild(head);
		}
	}
};

function VisitorManager() {
	this._visitors = {};
}
VisitorManager.prototype = {

	load: function vm_init(node) {
		var nodes = node.getElementsByTagName('visitor');
		for (var i = 0; i < nodes.length; ++i) {
			try {
				var visitor = new Visitor(nodes[i]);
				this._visitors[nodes[i].getAttribute('url')] = visitor;				
			} catch (ex) {
				Debug.dump("failed to read one visitor", ex);
			}
		}
	},
	save: function vm_save(node) {
		for (x in this._visitors) {
			var v = node.ownerDocument.createElement('visitor');
			v.setAttribute('url', x);
			this._visitors[x].save(v);
			node.appendChild(v);
		}
	},
	visit: function vm_visit(chan) {
		var url = chan.URI.spec;
		
		var visitor = new Visitor();
		chan.visitResponseHeaders(visitor);
		if (url in this._visitors)
		{
				this._visitors[url].compare(visitor);
		}
		return (this._visitors[url] = visitor);
	}
};

var chunkElement = function(start, end, d) {
	Debug.dump('ChunkElement: ' + start + "/" + end);
	this.start = start;
	this.end = end;
	this.relative = d;
}

chunkElement.prototype = {
	next : -1,
	previous : -1,
	isJoining : false,
	isRunning : false,
	chunkSize : 0,
	chunkName : "",
	fileManager : null,
	progressPersist : null,
	imWaitingToRearrange : false,
	getSize : function() {
		try {
			if (this.fileManager.exists())
				return this.fileManager.fileSize;
			else
				Debug.dump("chunkElement::getSize(): File doesn't exists!");
		} catch (e) {Debug.dump("chunkElement::getSize(): ", e);}
		return 0;
	},
	remove : function() {
		try {
			if (this.fileManager.exists()) {
				this.fileManager.remove(false);
			}	else {
				Debug.dump("chunkElement::remove(): File doesn't exists!");
			}
		} catch (e) {Debug.dump("chunkElement::remove(): ", e);}
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

function downloadElement(lnk, dir, num, desc, mask, refPage) {

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
	this.chunks = new Array();
	this.speeds = new Array();
	this.refPage = cc['@mozilla.org/network/standard-url;1'].createInstance(Components.interfaces.nsIURI);
	this.refPage.spec = refPage;
}

downloadElement.prototype = {
	contentType : "",
	visitors : null,
	totalSize : 0,
	partialSize : 0,
	startDate : null,
	
	compression : false,
	compressionType : "",
	
	treeID : "",
	alreadyMaskedDir : false,
	alreadyMaskedName : false,
	
	isCanceled : false,
	isPaused : false,
	isCompleted : false,
	isResumable: false,
	isRunning : false,
	isStarted : false,
	isPassed : false,
	isRemoved : false,
	
	isFirst : false,
	
	fileManager : null,
	declaratedChunks : 0,
	maxChunks : null,
	firstChunk : 0,
	
	timeLastProgress : 0,
	timeStart : 0,
	join : null,
	
	get icon() {
		return getIcon(this.fileName, 'metalink' in this);
	},
	
	imWaitingToRearrange : false,
	
	hasToBeRedownloaded : false,
	reDownload : function() {
		// replace names
		Debug.dump(this.urlManager.usable);
		this.destinationName = this.fileName = this.urlManager.usable.getUsableFileName();
		this.alreadyMaskedName = false;
		this.alreadyMaskedDir = false;
		this.dirSave = this.originalDirSave;
		
		// reset flags
		this.cancelFamily();
		this.totalSize = 0;
		this.partialSize = 0;
		this.compression = false;
		this.declaratedChunks = 0;
		this.chunks = new Array();
		this.visitors = new VisitorManager();
		this.getHeader();
	},
	
	getHeader : function() {
		Debug.dump(this.urlManager.url + " (" + this.refPage.spec +"): getHeader()");
		Prefs.refresh();
		this.maxChunks = Prefs.maxChunks;
		downloadChunk(0, 0, this, -1, true);
	},
	
	treeElement : null,
	setTreeCell : function(cell, caption) {
		if (this.isRemoved) return;
		if (this.treeElement==null)
			this.treeElement = $(this.treeID).childNodes[0];
		this.treeElement.childNodes[treeCells[cell]].attributes.label.value = caption;
	},
	
	setTreeProgress : function(style, value) {
		if (this.isRemoved) return;
		$(this.treeID).childNodes[0].childNodes[treeCells["bar"]].attributes.properties.value = style;
		if (value)
			$(this.treeID).childNodes[0].childNodes[treeCells["bar"]].attributes.value.value = value;
	},
	
	removeFromInProgressList : function() {
		//this.speeds = new Array();
		for (var i=0; i<inProgressList.length; i++)
			if (this==inProgressList[i].d) {
				inProgressList.splice(i, 1);
				break;
			}
	},

	cancelFamily : function() {
		var i = this.firstChunk;
		if (!this.chunks) return;
		while (this.chunks[i]) {
			try {
				if (!this.chunks[i].isRunning && !this.chunks[i].isJoining && this.chunks[i].fileManager.exists()) 
					this.chunks[i].remove();
			} catch (e) {}
			i=this.chunks[i].next;
			if (i == -1) break;
		}
	},
	
	setIsCompleted : function() {
		if (this.totalSize == 0) {
			// if contentlength is unknown..
			if (this.partialSize != 0 && !this.isRunning && !this.isPaused)
				this.isCompleted = true;
			else
				this.isCompleted = false;
		} else
			// bugfix #14525
			this.isCompleted = (this.partialSize == this.totalSize || this.partialSize == (this.totalSize-1) || this.partialSize == (this.totalSize+1));
		return this.isCompleted;
	},
	
	setIsRunning : function() {
	var running = false;
	try {
		if (this.chunks) {
			var i = this.firstChunk;
			while (this.chunks[i]) {
				if (this.chunks[i].isRunning) {
					running = true;
					break;
				}
				i=this.chunks[i].next;
				if (i == -1) break;
			}
		}
	} catch(e) {Debug.dump("setIsRunning():", e);}
	this.isRunning = running;
	return running;
	},
	
	refreshPartialSize : function(){
		var size = 0;
		for (var i = 0; i<this.chunks.length; i++)
			size += this.chunks[i].chunkSize;
		this.partialSize = size;
		return size;
	},
	
	setPaused : function(){
		for (var i = 0; i<this.chunks.length; i++)
			if (this.chunks[i].isRunning && this.chunks[i].progressPersist)
				this.chunks[i].progressPersist.cancelSave();
	},
	
	getSize : function() {
		try {
			if (this.fileManager.exists())
				return this.fileManager.fileSize;
			else
				Debug.dump("downloadElement::getSize(): File doesn't exists!");
		} catch (e) {Debug.dump("download::getSize(): ", e)}
		return 0;
	},
	
	moveCompleted : function(fileManager) {

		if (this.join) {
			this.join.closeStream();
		}
		if (this.isCanceled) {
			return;
		}
		Debug.dump(this.isMetalink);
		
		// increment completedDownloads counter
		this.isCompleted = true;
		Stats.completedDownloads++;	

		try {
			var destination = cc["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
			destination.initWithPath(this.dirSave);
			Debug.dump(this.fileName + ": Move " + fileManager.path + " to " + this.dirSave + this.destinationName);
			
			if (!destination.exists()) {
				destination.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0766);
			}
			this.checkFilenameConflict();
			var destinationName = (this.compression)?("[comp]"+this.destinationName):this.destinationName;
			
			// move file
			fileManager.moveTo(destination, destinationName);
			
		} catch(ex) {
			failDownload(this, strbundle.getString("accesserror"), strbundle.getString("permissions") + " " + strbundle.getString("destpath") + strbundle.getString("checkperm"), strbundle.getString("accesserror"));
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
			var fileManager = new FileFactory(this.dirSave);
			fileManager.append(this.destinationName);
			
			var fiStream = cc['@mozilla.org/network/file-input-stream;1'].createInstance(Components.interfaces.nsIFileInputStream);
			fiStream.init(fileManager, 1, 0, false);
			var domParser = new DOMParser();
			var doc = domParser.parseFromStream(fiStream, null, fileManager.fileSize, "application/xml");
			var root = doc.documentElement;
			fiStream.close();
			
			try {
				fileManager.remove(false);
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
	finishDownload : function() {

		// create final file pointer
		this.fileManager = new FileFactory(this.dirSave);
		var destinationName = (this.compression)?("[comp]"+this.destinationName):this.destinationName;
		this.fileManager.append(destinationName);
	
		this.totalSize = this.partialSize = this.getSize();
		this.setTreeCell("size", this.createDimensionString());
		this.setTreeCell("percent", "100%");
		this.setTreeProgress("completed", 100);
		
		// if zipped, unzip it
		if (this.compression) {
			if (!this.isCanceled) {
				Stats.zippedToWait++;
				this.setTreeCell("status", strbundle.getString("decompressing"));
				try {
					this.unzip();
				} catch(e){
					Debug.dump("finishDownload():", e);
				}
			}
			return;
		}
		
		this.isPassed = true;
		Stats.passedNumber++;
		this.setTreeCell("status", strbundle.getString("complete"));
		popup();
			
		// Garbage collection
		this.chunks = null;
	},
	
	unzip : function() {try {
		Debug.dump(this.fileName + ": Unzip: unzip into " + this.dirSave + this.destinationName + " from source " + this.fileManager.path);
		
		// create a channel from the zipped file
		var ios = cc["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
		var fileURI = ios.newFileURI(this.fileManager);
		var channel = ios.newChannelFromURI(fileURI); 
		
		// initialize output file
		var nomeFileOut = new FileFactory(this.dirSave + this.destinationName);
		
		try {
			nomeFileOut.create(nomeFileOut.NORMAL_FILE_TYPE, 0766);
		} catch(e) {
			failDownload(this, strbundle.getString("accesserror"), strbundle.getString("permissions") + " " + strbundle.getString("destpath") + strbundle.getString("checkperm"), strbundle.getString("accesserror"));
			Debug.dump("unzip(): Could not move file or create directory: ", e);
			return;
		}
		
		var fileUscita = cc['@mozilla.org/network/file-output-stream;1'].createInstance(Components.interfaces.nsIFileOutputStream);
		fileUscita.init(nomeFileOut, 0x02 | 0x08, 0766, 0);
		
		// set up the gzip converter
		var listener = new dataListener(fileUscita, nomeFileOut, this.fileManager, this);
		var converter = cc["@mozilla.org/streamconv;1?from="+this.compressionType+"&to=uncompressed"].createInstance(Components.interfaces.nsIStreamConverter);
		if ("AsyncConvertData" in converter) 
			converter.AsyncConvertData(this.compressionType, "uncompressed", listener, null);
		else
			converter.asyncConvertData(this.compressionType, "uncompressed", listener, null);
		
		// start the conversion
		channel.asyncOpen(converter,null);

	} catch (e) {Debug.dump("Unzip():", e);}
	},
	
	buildFromMask : function(dir, mask) {
		try {
			var uri = cc['@mozilla.org/network/standard-url;1']
				.createInstance(Components.interfaces.nsIURI);
			uri.spec = this.urlManager.usable;

			// normalize slashes
			mask = mask
				.removeLeadingChar("\\").removeFinalChar("\\")
				.removeLeadingChar("/").removeFinalChar("/")
				.replace(/([\\/]{1,})/g, slash);
	
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
	
			this.description = this.description.removeBadChars().replace(/[\\/]/g, "").trim();

			var name, ext;
			if (this.fileName.getExtension()) {
				var name = this.fileName.substring(0, this.fileName.lastIndexOf("."));
				var ext = this.fileName.getExtension();
				
				if (this.contentType && /html?/.test(this.contentType) && !/htm/.test(ext)) {
					ext += ".html";
				}
			}
			// mime-service method
			else if (this.contentType) {
				var contentType = (this.contentType.trim().split(" "))[0].removeFinalChar(";");
				var info = Components.classes["@mozilla.org/mime;1"]
					.getService(Components.interfaces.nsIMIMEService)
					.getFromTypeAndExtension(contentType, "");
				
				name = this.fileName;
				ext = info.primaryExtension;
			}
			else {
				name = this.fileName;
				ext = '';
			}
			
			var replacements = {
				"\\*name\\*" : name,
				"\\*ext\\*" : ext,
				"\\*text\\*" : this.description,
				"\\*url\\*" : uri.host,
				"\\*subdirs\\*" : uripath,
				"\\*refer\\*" : this.refPage.host,
				"\\*curl\\*" : (uri.host + ((uripath=="")?"":(replacedSlash + uripath))),
				"\\*num\\*" : makeNumber(this.numIstance),
				"\\*hh\\*" : String(this.startDate.getHours()).formatTimeDate(),
				"\\*mm\\*" : String(this.startDate.getMinutes()).formatTimeDate(),
				"\\*ss\\*" : String(this.startDate.getSeconds()).formatTimeDate(),
				"\\*d\\*"  : String(this.startDate.getDate()).formatTimeDate(),
				"\\*m\\*"  : String(this.startDate.getMonth()+1).formatTimeDate(),
				"\\*y\\*"  : String(this.startDate.getFullYear())
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
	
	checkFilenameConflict : function() {try {
	
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
		if (!this.isCompleted && this.isRunning) {
			if (realDest.exists()) {
				s = askForRenaming(
					strbundle.getFormattedString("alreadyexists", [this.destinationName, this.dirSave]) + " " + strbundle.getFormattedString("whatdoyouwith", [shortUrl]),
					{caption:strbundle.getFormattedString("reninto", [newDest]), value:0}, {caption:strbundle.getString("overwrite"), value:1}, {caption:strbundle.getString("skip"), value:2}
				);
			} else {
				var p = isInProgress(this.dirSave + this.destinationName, this);
				if (p != -1) {
					s = askForRenaming(
						strbundle.getString("samedestination", [shortUrl, this.destinationName, inProgressList[p].d.urlManager.url]) + " " + strbundle.getString("whatdoyou"),
						{caption:strbundle.getFormattedString("reninto", [newDest]), value:0}, {caption:strbundle.getString("skipfirst"), value:2}, {caption:strbundle.getString("cancelsecond"), value:3}
					);
				}
			}
		}
		// if it's completed, and we're going to build final file
		else if (this.isCompleted && !this.isPassed) {
			if (realDest.exists()) {
				s = askForRenaming(
					strbundle.getFormattedString("alreadyexists", [this.destinationName, this.dirSave]) + " " + strbundle.getFormattedString("whatdoyoucomplete", [shortUrl]),
					{caption:strbundle.getFormattedString("reninto", [newDest]), value:0}, {caption:strbundle.getString("overwrite"), value:1}, {caption:strbundle.getString("cancel"), value:4}
				);
			}
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
				this.cancelDownload(strbundle.getString("skipped"));
				break;
			}
			case 3: {
				inProgressList[p].d.cancelDownload();
				break;
			}
			case 4: {
				this.cancelDownload();
				break;
			}
		}
		
	} catch(e) {Debug.dump("checkFilenameConflict():", e);}
	},
	
	cancelDownload : function(message) {try {
		if (!this.isCanceled) {
			Debug.dump(this.fileName + ": cancelDownload()");
			
			this.visitors = new VisitorManager();
			
			if (this.isFirst) {
				Check.setFirstInQueue();
			}
			this.isCanceled = true;
			
			if (message == "" || !message) {
				message = strbundle.getString("canceled");
			}
			this.setTreeCell("status", message);
			this.setTreeProgress("canceled");
			
			if (!this.isCompleted) {
				if (this.setIsRunning()) {
					this.setPaused();
				} else if (this.join != null && this.join.imJoining) {
					this.join.stopJoining();
				} else {
					this.isPassed = true;
					Stats.passedNumber++;
				}
			} else {
				this.isCompleted = false;
				Stats.completedDownloads--;
				this.join = null;
			}
			
			this.cancelFamily();
			
			if (this.isPaused)
				this.isPaused = false;

			Check.checkClose();
			popup();
		}
	} catch(ex) {
		Debug.dump("cancelDownload():", ex);
	}
	},
	
	resumeDownload : function () {try {
	
		if (!("length" in this.chunks) || this.chunks.length==0) {
			this.getHeader();
			return false;
		}
		
		if (this.maxChunks == null) {
			Prefs.refresh();
			this.maxChunks = Prefs.maxChunks;
		}
		
		if (this.maxChunks==this.declaratedChunks) 
			return false;
		
		Debug.dump(this.fileName + ": resumeDownload()");
		
		/*
		cp = chunk che si devono inserire
		sp = spazi da riempire
		c = floor(cp / sp)
		m = cp % sp
		
		(sp-m) spazi dovranno venire spartiti tra c chunks ciascuno, 
		mentre i rimanenti m spazi dovranno venire spartiti tra c+1 chunks ciascuno. 
		*/
		
		var cp = this.maxChunks - this.declaratedChunks;
		var sp = new Array();
		
		// calcolo sp - gli spazi vuoti e le sue proprieta'
		if (this.chunks[this.firstChunk].start!=0) {
			var e = new Object();
			e.start = 0;
			e.end = this.chunks[this.firstChunk].start - 1;
			e.prev = -1;
			e.next = this.firstChunk;
			sp.push(e);
		}
	
		var i = this.firstChunk;
		while (this.chunks[i].next!=-1) {
			if (this.chunks[i].end != this.chunks[this.chunks[i].next].start - 1) {
				var e = new Object();
				e.start = this.chunks[i].end + 1;
				e.end = this.chunks[this.chunks[i].next].start - 1;
				e.prev = i;
				e.next = this.chunks[i].next;
				sp.push(e);
			}
			i=this.chunks[i].next;
		}
		
		if (this.chunks[i].end != this.totalSize - 1) {
			var e = new Object();
			e.start = this.chunks[i].end + 1;
			e.end = this.totalSize - 1;
			e.prev = i;
			e.next = -1;
			sp.push(e);
		} 
		
		if (sp.length == 0)
			return false;
		
		// ordino gli spazi in dimensione crescente per ottimizzarea l'utilizzo dei chunk
		// PER OTTIMIZZARE IL JOIN, CONVIENE INVECE CONSIDERARE I CHUNK IN ORDINE
		//sp.sort(sortByDimension);
		
		// faccio partire i chunk
		var m = cp % sp.length;
		var n = sp.length-m;
		var c = Math.floor(cp/sp.length);
		var rest = 0;
		
		// chiedo di poter utilizzare c chunks. startSubChunks mi ritorna quanti non e' stato possibile utilizzare. 
		// quei chunks si prova quindi a buttarli nello spazio successivo. ordinandoli per dimensione i piu' piccoli buttano
		// le rimanenze sui piu' grandi.
		
		var i = 0;
		if (c > 0 && n > 0) {
			this.isRunning = true;
			for (; i<n; i++) {
				rest += startSubChunks(sp[i].start, sp[i].end, sp[i].prev, sp[i].next, c+rest, this);
			}
		}
		
		var s = i;
		if (m > 0) {
			this.isRunning = true;
			for (; i<(s+m); i++) {
				rest += startSubChunks(sp[i].start, sp[i].end, sp[i].prev, sp[i].next, c+1+rest, this);
			}
		}
	
		return true;
		
		} catch(e) {Debug.dump("resumeThis():", e);}
		return false;
	},
	createDimensionString : function() {
		if (this.totalSize > 0) {
			return formatBytes(this.partialSize) + "/" + formatBytes(this.totalSize);
		}
		return formatBytes(this.partialSize) + "/" + "???";
	}
	
}


function joinListener(d) {
	Debug.dump("joinListener created for #"+d.fileName);

	this.d = d;
	try
	{
		this.init();
	} catch (ex) {
		// at least break the download here and do not waste bandwidth
		Debug.dump("joinlistener::init:", ex);
		this.closeStream();
		/// XXX: l10n friendly
		failDownload(this.d, 'Joining failure', 'Joining failed to initialize', 'Joining Failure');
	}	
}

joinListener.prototype = {

	stopRequest : null,
	imJoining : false,
	outStream: null,

	dump: function JL_dump(m, f) {
		if (typeof f == 'number') {
			try {
				f = this.d.chunks[f];
			} catch (ex) {}
		}
		if (typeof f == 'object' && 'fileManager' in f) {
			m += " [" + f.fileManager.leafName + "]";
		}
		Debug.dump('joinListener: ' + m);
	},
	
	next : function JL_next() {
		return this.d.chunks[this.current].next;
	},
	
	stopJoining : function JL_stopJoining(c) {
		if (this.stopRequest != null)
			this.stopRequest.cancel(0);
		this.closeStream();
	},
	
	init: function JL_init() {
		this.current = this.d.firstChunk;
		this.offset = this.d.chunks[this.d.firstChunk].chunkSize;
		this.fileManager = this.d.chunks[this.d.firstChunk].fileManager.clone();

		// open the stream in RW mode and seek to its end ;)
		// saves a lot of headaches :p
		var outStream = cc['@mozilla.org/network/file-output-stream;1'].createInstance(Components.interfaces.nsIFileOutputStream);
		outStream.init(this.fileManager, 0x04 | 0x08, 0766, 0);
		this.outStream = outStream.QueryInterface(Components.interfaces.nsISeekableStream);
		if (Preferences.getDTA("prealloc", true) && this.fileManager.fileSize != this.d.totalSize) {
			this.dump('trying to prealloc', this.d.firstChunk);
			this.outStream.seek(0x00, this.d.totalSize);
			this.outStream.setEOF();
		}
	
		this.outStream.seek(0x00, this.offset);
		
		// seek does not work correctly :p
		if (this.outStream.tell() != this.offset) {
			this.dump("tell mismatch" + this.offset + "/" +  this.outStream.tell() + "/" + (this.offset - this.outStream.tell()));
			this.d.cancelDownload();
		}
		
		if (this.next() != -1)
			this.join(this.next());
	},
	
	join : function JL_join(c) {try {
	
		this.dump('join request', c);
		if (!this.outStream) {
			throw ("No outstream");
		}
		
		if (c != this.next() || this.d.chunks[c].isRunning || this.imJoining) return;
		if ((this.d.chunks[c].start - this.d.chunks[this.current].end) != 1) return;
		if (!this.d.chunks[c].fileManager.exists()) return;
		
		this.imJoining = this.d.chunks[this.current].isJoining = this.d.chunks[c].isJoining = true;
		var ios = cc["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);		

		var fileURI = ios.newFileURI(this.d.chunks[c].fileManager);
		var channel = ios.newChannelFromURI(fileURI); // create a channel from the downloaded chunk
		
		var listener = new dataCopyListener(this.outStream, this.d, c, this.offset, this);
		channel.asyncOpen(listener, null);
		
		this.dump('join started', c);
	} catch (e) {Debug.dump("join(): ", e);}
	},
	
	closeStream: function JL_closeStream() {
		if (this.outStream) {
			this.dump('closeStream', this.d.firstChunk);
			this.outStream.close();
			this.outStream = null;
		}
	},
	
	joinIsFinished : function JL_jobIsFinished(chunk) {
		this.imJoining = false;
		this.d.chunks[this.current].isJoining = this.d.chunks[chunk].isJoining = false;
		
		// are we canceled now?
		if (this.d.isCanceled) {
			this.closeStream();

			Debug.dump("JoinIsFinished: Cancelling " + this.d.fileName);
			this.d.isPassed = true;
			Stats.passedNumber++;
			this.d.cancelFamily();
			this.d.chunks = new Array();
			Check.checkClose();
			if (this.d.isRemoved) setRemoved(this.d);
			
			// return early
			return;
		}
		
		var p = this.d.chunks[this.current];
		var c = this.d.chunks[chunk];
		
		c.start = 0;
		c.fileManager = this.fileManager;
		c.chunkSize += p.chunkSize;
		c.previous = -1;
		p.chunkSize = 0;
		this.d.firstChunk = chunk;
		
		// put it in to debug a problem, which was: chunksize < filesize because incomplete chunks got saved due to a programming error
		var told = this.outStream.tell()
		if (this.offset != told) {
			this.dump("tell() mismatch: " + this.offset + "/" +  this.outStream.tell() + "/" + (this.offset - this.outStream.tell()));
			if (this.offset < told) {
				this.outStream.seek(0x00, this.offset);
			} else {
				this.d.cancelDownload();
			}
		}
	
		if (!this.d.isRunning && this.d.isPaused && Check.isClosing) {
			this.closeStream();
			Debug.dump("We're closing from Join... isPassed=true");
			this.d.isPassed = true;
			Stats.passedNumber++;
			Check.checkClose();
		} 
		// more to do
		else {
			this.current = chunk;
			// next piece already available?
			if (this.next() != -1) {
				this.join(this.next());
			}
			// finished after all.
			else if (this.d.isCompleted) {
				this.closeStream();
				this.d.moveCompleted(this.fileManager);
			}
		}
	}
}

function dataCopyListener(outStream, d, chunk, offset, join) {
	this.outStream = outStream;
	this.d = d;
	this.chunk = chunk;
	this.oldoffset = offset;
	this.join = join;
}

dataCopyListener.prototype = {
	error : false,
	myOffset : 0,
	
	QueryInterface : function DCL_QueryInterface(iid) {
		if(
			iid.equals(Components.interfaces.nsISupports)
			|| iid.equals(Components.interfaces.nsIStreamListener)
			|| iid.equals(Components.interfaces.nsIRequestObserver)
		) return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
 	},
	
	onStartRequest : function DCL_onStartRequest(request, context) {
		this.join.stopRequest = request;
	},
	
	onStopRequest : function DCL_onStopRequest(request, context, status) {
		if (status == Components.results.NS_OK && !this.error) {
			Debug.dump(this.d.fileName + ": Join of chunk " + this.d.chunks[this.chunk].start + "-" + this.d.chunks[this.chunk].end + " completed");
			this.join.offset = this.oldoffset + this.d.chunks[this.chunk].chunkSize;
			try {
				this.d.chunks[this.chunk].remove();
			} catch(e) {}
			this.join.joinIsFinished(this.chunk);
		} else {
			Debug.dump("Error in Joining of " + this.d.fileName);
			if (!this.d.isCanceled)
				this.d.cancelDownload();
			else
				this.join.joinIsFinished(this.chunk, this.myOffset);
		}
	},
	
	onDataAvailable : function DCL_onDataAvailable(request, context, inputStream, offset, count) {try {

		this.join.offset = this.oldoffset + offset;
		if (this.d.isCompleted && !this.d.isCanceled && !this.d.isRemoved) {
			this.d.setTreeCell("percent", Math.round(this.join.offset / this.d.totalSize * 100) + "%");
			this.d.setTreeProgress("inprogress", Math.round(this.join.offset / this.d.totalSize * 100));
			if (Check.isClosing)
				this.d.setTreeCell("status", strbundle.getString("completing"));
			else
				this.d.setTreeCell("status", strbundle.getString("joining"));
		}
		// need to wrap this as nsIInputStream::read is marked non-scriptable.
		var byteStream = cc['@mozilla.org/binaryinputstream;1'].createInstance(Components.interfaces.nsIBinaryInputStream);
		byteStream.setInputStream(inputStream);
		// we're using nsIFileOutputStream
		if (this.outStream.write(byteStream.readBytes(count), count) != count) {
			throw ("dataCopyListener::dataAvailable: read/write count mismatch!");
		}
	} catch(e) {
		this.error = true;
		request.cancel(Components.results.NS_BINDING_ABORTED);
		Debug.dump("onDataAvailable():", e);
	}
	}
}

function failDownload(d, title, msg, state) {
	try {
		if (Preferences.getDTA("sounds.error", false)) {
			var sound = Components.classes["@mozilla.org/sound;1"]
				.createInstance(Components.interfaces.nsISound);
			var uri = cc['@mozilla.org/network/standard-url;1']
				.createInstance(Components.interfaces.nsIURI);
			uri.spec = "chrome://dta/skin/sounds/error.wav";
			sound.play(uri); 
		}
	}
	catch(ex) {
		Debug.dump("Playing error sound failed", ex);
	}
	
	if (Prefs.alertingSystem == 1 && !alerting) {
		alerting = true;
		cc['@mozilla.org/alerts-service;1']
			.getService(Components.interfaces.nsIAlertsService)
			.showAlertNotification(
				"chrome://dta/skin/common/alert.png",
				title,
				msg,
				false,
				"errore",
				new obsAlert()
			);
	} else if (Prefs.alertingSystem == 0) {
		alert(msg);
	}

	d.cancelDownload(state);
	
	return;
}


// --------* inProgressElement *--------
function inProgressElement(el) {
	this.d = el;
	this.lastBytes = el.partialSize;
	this.speeds = new Array();
}

var downloadList = new Array();
var inProgressList = new Array();

// --------* Notifiche slide *--------

function obsAlert () {
	this.dir = cc["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
}

obsAlert.prototype = {
	observe : function (aSubject, aTopic, aData){
		switch (aTopic) {
			case "alertfinished":
			// global variable
			alerting = false;
			break;
			case "alertclickcallback":
			if (aData != "errore") {
				try {
					this.dir.initWithPath(aData);
					this.dir.launch();
				} catch (e) {}
			}
			break;
		}
	},
	onAlertFinished : function (aCookie) {
		alerting = false;
	},
	onAlertClickCallback : function (aCookie) {
		if (aCookie != "errore") {
			try {
				this.dir.initWithPath(aCookie);
				this.dir.launch();
			} catch (e){}
		}
	}
}

// --------* Controlli di chiusura e avvio nuovi downloads *--------

var Check = {
	imRemoving : false,
	lastCheck : 0,
	lastDownloads : -1,
	haveToCheck : true,
	timerRefresh : 0,
	timerCheck : 0,
	isClosing : false,
	firstInQueue : -1,
	frequencyRefresh : 1500,
	frequencyCheck : 500,
	frequencyUpdateChunkGraphs : 500,
	lastSum : 0,
	
	refreshDownloadedBytes : function() {
		// update statusbar
		for (var i=0; i<inProgressList.length; i++)
			Stats.downloadedBytes+=inProgressList[i].d.partialSize;
		return Stats.downloadedBytes;
	},
	
	refreshGUI : function() {try{
		
		// Calculate global speed
		var sum = 0;
		for (var i=0; i<inProgressList.length; i++)
			sum+=inProgressList[i].d.partialSize;
		
		var speed = Math.round((sum - this.lastSum) * (1000 / this.frequencyRefresh));
		speed = (speed>0)?speed:0;
		
		this.lastSum = sum;
		
		// Refresh status bar
		$("status").label = (
			strbundle.getFormattedString("cdownloads", [Stats.completedDownloads, downloadList.length]) +
			" - " + 
			strbundle.getString("cspeed") + " " + formatBytes(speed) + "/s"
		);
		
		// Refresh window title
		if (inProgressList.length == 1 && inProgressList[0].d.totalSize > 0) {
			document.title = (
				Math.round(inProgressList[0].d.partialSize / inProgressList[0].d.totalSize * 100) + "% - " + 
				Stats.completedDownloads + "/" + downloadList.length + " - " + 
				formatBytes(speed) + "/s - DownThemAll! - " + strbundle.getString("dip")
			);
		} else if (inProgressList.length > 0)
			document.title = (
				Stats.completedDownloads + "/" + downloadList.length + " - " + 
				formatBytes(speed) + "/s - DownThemAll! - " + strbundle.getString("dip")
			);
		else
			document.title = Stats.completedDownloads + "/" + downloadList.length + " - DownThemAll!";
		
		var data = new Date();
		for (var i=0; i<inProgressList.length; i++) {
			var d = inProgressList[i].d;
			if (d.partialSize != 0 && !d.isPaused && !d.isCanceled && !d.isCompleted && (data.getTime() - d.timeStart) >= 1000 ) {
				// Calculate estimated time
				if (d.totalSize > 0) {
					var remainingSeconds = Math.ceil((d.totalSize - d.partialSize) / ((d.partialSize - inProgressList[i].lastBytes) * (1000 / this.frequencyRefresh)));
					var hour = Math.floor(remainingSeconds / 3600);
					var min = Math.floor((remainingSeconds - hour*3600) / 60);
					var sec = remainingSeconds - min * 60 - hour*3600;
					if (remainingSeconds == "Infinity") 
						d.setTreeCell("status", strbundle.getString("unavailable"));
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
	
	checkDownloads : function() {try {
		
		this.refreshDownloadedBytes();
		Prefs.refresh();
		
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
					d.isPaused = true;
					d.setTreeCell("status", strbundle.getString("timeout"));
					d.setTreeProgress("paused");
				} else
					d.cancelDownload(strbundle.getString("timeout"));

				popup();
				Debug.dump("checkDownloads(): " + d.fileName + " in timeout");
			}
		}
		this.timerCheck = setTimeout("Check.checkDownloads();", this.frequencyCheck);
	} catch(e) {Debug.dump("checkDownloads():", e);}
	},
	
	checkClose : function() {try{
	
	this.refreshDownloadedBytes();

	if (
		Stats.passedNumber == downloadList.length
		&&
		downloadList.length!=0
		&&
		this.lastCheck != Stats.downloadedBytes
		&&
		Stats.zippedToWait==0
	) {
		Debug.dump("checkClose(): All downloads passed correctly");
		this.lastCheck = Stats.downloadedBytes;
		Prefs.refresh();
	
		try {
			if (Preferences.getDTA("sounds.done", true)) {
				var sound = Components.classes["@mozilla.org/sound;1"]
					.createInstance(Components.interfaces.nsISound);
				var soundURI = cc['@mozilla.org/network/standard-url;1']
					.createInstance(Components.interfaces.nsIURI);
				soundURI.spec = "chrome://dta/skin/sounds/done.wav";
				sound.play(soundURI); 
			}
		}
		catch(ex) {
			Debug.dump("Playing done sound failed", ex);
		}

		// if windows hasn't focus, show FF sidebox/alerts
		if (!winFocus && Stats.completedDownloads > 0) {
			var stringa;
			if (Stats.completedDownloads > 0)
				stringa = strbundle.getString("suc");
			
			if (Prefs.alertingSystem == 1 && !alerting) {
				alerting = true;
				alert = cc['@mozilla.org/alerts-service;1'].getService(Components.interfaces.nsIAlertsService);
				alert.showAlertNotification("chrome://dta/content/immagini/alert.png", strbundle.getString("dcom"), stringa, true, downloadList[0].dirSave, new obsAlert());
			} else if (Prefs.alertingSystem == 0) {
				if (confirm(stringa + "\n "+ strbundle.getString("folder")) == 1) {
					var dir = cc["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
					try {
						dir.initWithPath(downloadList[0].dirSave);
						dir.launch();
					} catch (e){strbundle.getString("noFolder");}
				}
			}
		}
		
		// checks for auto-disclosure of window
		if (Preferences.getDTA("closedta", false) || Check.isClosing) {
			Debug.dump("checkClose(): I'm closing the window/tab");
			clearTimeout(this.timerCheck);
			clearTimeout(this.timerRefresh);
			sessionManager.save(true);
		} else
			sessionManager.save();
	}
	} catch(e) {Debug.dump("checkClose():", e);}
	},
	
	setFirstInQueue : function() {try {
	
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
			if (!dow.isCompleted && !dow.isRunning && !dow.isCanceled && !dow.isPaused && !dow.hasToBeRedownloaded) {
				this.firstInQueue = ind;
				downloadList[this.firstInQueue].isFirst = true;
				return ind;
			}
		}
	} else {
		for (var i = 0; i<downloadList.length; i++) {
			var d = downloadList[i];
			// se non e' cancellato, non e' in pausa, non e' gia' completato ed e' in coda che aspetta
			if (!d.isCompleted && !d.isRunning && !d.isCanceled && !d.isPaused && !d.hasToBeRedownloaded) {
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
	
	startNextDownload : function () {try {

		var i = this.firstInQueue;
		if (i == -1) {
			return;
		}

		var d = downloadList[i];

		d.setTreeCell("status", strbundle.getString("starting"));
	
		d.timeLastProgress = (new Date()).getTime();
		d.isRunning = true;
	
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
		
		// e' gia' partito o e' un nuovo download?
		if (!d.isStarted) {
			d.isStarted = true;
			Debug.dump("Let's start " + d.fileName);
			d.getHeader();
		} else {
			Debug.dump("Let's resume " + d.fileName + ": " + d.partialSize);
			d.resumeDownload();
		}
		
		this.setFirstInQueue();
	
	} catch(e){Debug.dump("startNextDownload():", e);}
	}
}

// --------* Progress Listener per il singolo download *--------

function PersistProgressListener(chunkIndex, c, d, header) {
	this.d = d;
	this.c = c;
	this.chunkIndex = chunkIndex;
	this.isHeaderHack = header;
}

PersistProgressListener.prototype = {

cantCount : 0,
isPassedOnProgress : false,

// null function
init: function() {},
destroy: function() {},
prompt: function (dialogTitle, text, passwordRealm, savePassword, defaultText, result) {}, 
promptPassword: function  (dialogTitle, text, passwordRealm, savePassword, pwd) {},
onLocationChange: function (aWebProgress, aRequest, aLocation) {},
onStatusChange: function (aWebProgress, aRequest, aStatus, aMessage) {},
onSecurityChange: function (aWebProgress, aRequest, aState) {},

QueryInterface : function(aIID) {
	if(aIID.equals(Components.interfaces.nsIWebProgressListener2))
	 return this;
	if(aIID.equals(Components.interfaces.nsIAuthPrompt))
	  return this;
	 throw Components.results.NS_OK;
},

getUserPass : function(url) {
try {
	url = url.removeFinalBackSlash();
	var host = {value:""};var user =  {value:""};var password = {value:""};
	var r = {user:{value:""},pass:{value:""}};
	
	var PMI = cc["@mozilla.org/passwordmanager;1"].createInstance(Components.interfaces.nsIPasswordManagerInternal)
	PMI.findPasswordEntry(url, "", "", host, user, password);
	r.user.value = user.value;
	r.pass.value = password.value;
	return r;
	
} catch (e) {}
return r;
},

saveHostPassword : function(url, username, password) {
	Debug.dump(d.fileName + ": Trying to save user and pass");
	var passwordManager = cc["@mozilla.org/passwordmanager;1"].createInstance();
	passwordManager = passwordManager.QueryInterface(Components.interfaces.nsIPasswordManager);
	
	if (!passwordManager) return;
	try {
		// Remove existing entry
		passwordManager.removeUser(url, username);
	 } catch (e) {}
		
	try{
		//add new entry
		passwordManager.addUser(url, username, password);
	} catch (e) {}
},

promptUsernameAndPassword : function  (dialogTitle, text, passwordRealm, savePassword, user, pwd) {
	Debug.dump(d.fileName + ": We're asking for user and pass...");
	var defaultLogin = this.getUserPass(passwordRealm);
	var v = (defaultLogin.user.value=="")?false:true;
	var check = {value: v};
	var prompt = cc["@mozilla.org/embedcomp/prompt-service;1"].createInstance(Components.interfaces.nsIPromptService);
	var r = prompt.promptUsernameAndPassword(this, dialogTitle, text, defaultLogin.user, defaultLogin.pass, "Let Firefox Password Manager and dTa remember this logon", check);
	if (r) {
		this.d.user = defaultLogin.user.value;
		this.d.pass = defaultLogin.pass.value;
		if (check.value)
			this.saveHostPassword(passwordRealm, defaultLogin.user.value, defaultLogin.pass.value);
	}
},

onStateChange : function (aWebProgress, aRequest, aStateFlags, aStatus) {try {
	
	if (!(aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP)) return;
	
	// shortcuts
	var c = this.c;
	var d = this.d;
	
	// refresh partial size
	c.chunkSize = c.getSize();
	if (c.chunkSize == 0) {
		Debug.dump("onStateChange: chunk " + c.fileManager.path + " finished, but has zero size, I have to delete it.")
		c.remove();
		if (c.previous != -1) d.chunks[c.previous].next = c.next;
		if (c.next != -1) d.chunks[c.next].previous = c.previous;
	}
	Check.refreshDownloadedBytes();
	d.refreshPartialSize();	
	
	// update flags and counters
	c.isRunning = false;
	d.setIsRunning();
	d.declaratedChunks--;
	d.setTreeCell("parts", 	d.declaratedChunks + "/" + d.maxChunks);
	
	d.setIsCompleted();
	
	// if it's the chunk that tested response headers
	if (this.isHeaderHack && !d.isCompleted) {
		d.chunks.splice(this.chunkIndex, 1);
		
		if (this.isPassedOnProgress && !d.isCanceled && !Check.isClosing && !d.isPaused) {
			Debug.dump(d.fileName + ": Header stopped to start download in multipart");
			downloadMultipart(d);
			return;
		} else {
			Debug.dump(d.fileName + ": Header stopped.");
			
			d.isStarted = false;
			
			// removed downloads are not included in passedNumber
			if (Check.isClosing && !d.isRemoved) {
				d.isPassed = true;
				Stats.passedNumber++;
			} else if (!this.isPassedOnProgress)
				failDownload(
				d,
				strbundle.getString("srver"),
				strbundle.getFormattedString("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]),
				strbundle.getString("srver")
				);
				
			d.removeFromInProgressList();
			popup();
			Check.checkClose();
		}
		sessionManager.save();
		return;
	}
	
	// update chunk range
	c.end = c.start + c.chunkSize - 1;
	
	// routine for normal chunk
	Debug.dump(d.fileName + ": Chunk " + c.start + "-" + c.end + " finished.");

	// corrupted range: waiting for all the chunks to be terminated and then restart download from scratch
	if (d.hasToBeRedownloaded) {
		if (!d.isRunning) {
			Debug.dump(d.fileName + ": All old chunks are now finished, reDownload()");
			d.reDownload();
		}
		popup();
		sessionManager.save();
		return;
	} else 
	// check for corrupted ranges
	if (d.isResumable && c.next!=-1 && c.end >= d.chunks[c.next].start) {
		Debug.dump(d.fileName + ": Error on chunks range.. Redownload file in normal mode");
		d.hasToBeRedownloaded = true;
		d.redownloadIsResumable = false;
		if (!d.isRunning) {
			Debug.dump(d.fileName + ": All old chunks are finished, reDownload()");
			d.reDownload();
		} else 
			d.setPaused();
		popup();
		sessionManager.save();
		return;
	}

	// ok, chunk passed all the integrity checks!
	
	// isHeaderHack chunks have their private call to removeFromInProgressList
	if (!d.isRunning && !d.imWaitingToRearrange) {
		d.setTreeCell("speed", "");
		d.removeFromInProgressList();
	}

	// rude way to determine disconnection: if connection is closed before download is started we assume a server error/disconnection
	if (!this.isPassedOnProgress && d.isResumable && !c.imWaitingToRearrange && !d.isCanceled && !d.isPaused) {
		Debug.dump(d.fileName + ": Server error or disconnection (type 1)");
		d.setTreeCell("status", strbundle.getString("srver"));
		d.setTreeCell("speed", "");
		d.setTreeProgress("paused");
		d.isPaused = true;
		d.setPaused();
	}
	// if the only possible chunk for a non-resumable download finishes and download is still not completed -> server error/disconnection
	else if (!d.isResumable && !d.isCompleted && !d.isCanceled && !d.isPaused) {
		Debug.dump(d.fileName + ": Server error or disconnection (type 2)");
		failDownload(
			d,
			strbundle.getString("srver"),
			strbundle.getFormattedString("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]),
			strbundle.getString("srver")
		);
		sessionManager.save();
		return;
	}
	
	// can we start/continue joining routine?
	if (!Check.isClosing && !d.isCanceled && d.isResumable) {
		// create new Joining routine
		if (d.firstChunk==this.chunkIndex && d.join==null) {
			d.join = new joinListener(d);
		} else 
		// continue from already started Joining
		if (d.join != null && this.chunkIndex == d.join.next())
			d.join.join(this.chunkIndex);
	}
	
	// if download is complete
	if (d.isCompleted && !d.isCanceled) {
	
		Debug.dump(d.fileName + ": Download is completed!");
		
		// multipart downloads have moveCompleted call after the last joining process
		if (d.chunks.length == 1)
			d.moveCompleted(c.fileManager);
	} else 
	
	// if we have to close window
	if (!d.isRunning && d.isPaused && Check.isClosing) {
	
		if (d.join == null || !d.join.imJoining) {
			// removed downloads are not included in passedNumber
			if (!d.isRemoved) {
				d.isPassed = true;
				Stats.passedNumber++;
			}
			// reset download as it was never started (in queue state)
			if (!d.isResumable) {
				d.isStarted = false;
				d.isPaused = false;
				d.cancelFamily();
				d.chunks = new Array();
				d.totalSize = 0;
				d.partialSize = 0;
				d.compression = false;
				d.declaratedChunks = 0;
				d.visitors = new VisitorManager();
			}
			Check.checkClose();
		} else 
			Debug.dump(d.fileName + ": We have to wait for Join...");
	} else 
	
	// if a chunk gets completed and nothing else happens
	if (!d.isPaused && !d.isCanceled && d.isResumable) {
	
		// if all the download space has already been occupied by chunks (= !resumeDownload)
		if (!d.imWaitingToRearrange && !d.resumeDownload() && (d.maxChunks - d.declaratedChunks) > 0) {
	
			// find the biggest running chunk..
			var j = null;
			for (var x=0; x<d.chunks.length; x++)
				if (d.chunks[x].isRunning) {
					if (j==null)
						j=d.chunks[x];
					else if ((j.end - j.start - j.chunkSize) < (d.chunks[x].end - d.chunks[x].start))
						j = d.chunks[x];
				}
			
			// ..and if it can be splitted up in more than a chunk..
			if (Math.round((j.end - j.start - j.chunkSize) / Prefs.minChunkSize) > 1) {
				Debug.dump(d.fileName + ": Rearrange chunk " + j.start + "-" + j.end);
				// ..we stop it..
				d.imWaitingToRearrange = true;
				j.imWaitingToRearrange = true;
				j.progressPersist.cancelSave();
			}
			
		} else if (c.imWaitingToRearrange) {
		
			// ..to let resumeDownload split space in a better way.
			c.imWaitingToRearrange = false;
			d.imWaitingToRearrange = false;
			d.resumeDownload();
		}
		
	} else 

	// if download has been canceled by user
	if (d.isCanceled) {
		Debug.dump(d.fileName + ": Download has been canceled.. erase chunk.");
		c.remove();
		
		if (!d.isRunning) {
			if (d.join != null && d.join.imJoining)
				d.join.stopJoining();
			else if (!d.isRemoved) {
				// removed downloads are not included in passedNumber
				d.isPassed = true;
				Stats.passedNumber++;
				d.chunks = new Array();
			}
		}
		Check.checkClose();
	}
	
	sessionManager.save();
	// refresh GUI
	popup();
	
	// Garbage Collection
	c.progressPersist = null;

} catch(e) {Debug.dump("onStateChange():",  e)}
},

onProgressChange64 : function (aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
	try {

		// shortcuts
		var c = this.c;
		var d = this.d;	

		// flag
		var firstProgress = false;
		if (!this.isPassedOnProgress) {
			this.isPassedOnProgress = true;
			firstProgress = true;
			Debug.dump("First ProgressChange for chunk " + c.fileManager.path + "!");
		}

		// if user setted pause, stop the download
		if (d.isPaused) {
			c.progressPersist.cancelSave();
			return;
		}

		// if user setted cancel, stop and remove chunk
		if (d.isCanceled) {
			c.progressPersist.cancelSave();
			c.remove();
			return;
		} 

		var data = new Date();
		d.timeLastProgress = data.getTime();

		if (firstProgress) {

			try {var chan = aRequest.QueryInterface(Components.interfaces.nsIHttpChannel);} catch(e) {}

			// if we don't have any HTTP Response (e.g. FTP link)
			if (!(chan instanceof Components.interfaces.nsIHttpChannel)) {
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

			// every chunk has to check response status senseness
			if (chan.responseStatus == 401 && "user" in d && d.user!="" && "pass" in d && d.pass!="") {
				Debug.dump(d.fileName + ": Trying to redownload file with user and pass..");
				d.hasToBeRedownloaded = true;
				d.redownloadIsResumable = null;
				this.isHeaderHack = false;
				c.end = d.totalSize - 1;
				d.setPaused();
				return;
			} else if (chan.responseStatus >= 400) {
				// se si tratta di errore >= 400 blocchiamo e basta
				failDownload(
				d,
				strbundle.getFormattedString("error", [chan.responseStatus]),
				strbundle.getFormattedString("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]) + " " + strbundle.getFormattedString("sra", [chan.responseStatus]) + ": " + chan.responseStatusText,
				strbundle.getFormattedString("error", [chan.responseStatus])
				);
				return;
			} else if (chan.responseStatus != 206 && c.end != 0) {
				// se stiamo richiedendo un range e non ci viene dato codice 206, ci buttiamo nei chunk singoli
				Debug.dump(d.fileName + ": Server returned a " + chan.responseStatus + " response instead of 206... Normal mode");
				d.hasToBeRedownloaded = true;
				d.redownloadIsResumable = false;
				d.setPaused();
				return;
			}

			var visitor = null;
			try {
				visitor = d.visitors.visit(chan);
			} catch (ex) {
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
				if (visitor.type) d.contentType = visitor.type;

				// compression?
				d.compression = (
					(visitor.encoding=="gzip"||visitor.encoding=="deflate")
					&&
					!(/gzip/).test(d.contentType)
					&&
					!(/gz/).test(d.fileName)
				);
				if (d.compression) d.compressionType = visitor.encoding;

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
				} else {
					d.totalSize = 0;
					d.isResumable = false;
				}
				// Checks for available disk space. 
				// XXX: l10n
				var tsd = d.totalSize;
				var nsd;
				if (Prefs.tempLocation)	{
					var tst = d.totalSize + (Preferences.getDTA("prealloc", true) ? d.totalSize : Prefs.maxChunkSize);
					nds = Prefs.tempLocation.diskSpaceAvailable
					if (nds < tst) {
						Debug.dump("There is not enought free space available on temporary directory, needed=" + tst + " (totalsize="+ d.totalSize +"), user=" + nds);
						failDownload(d, strbundle.getString("ndsa"), strbundle.getString("spacetemp"), strbundle.getString("freespace"));
						return;
					}
				}	else {
					tsd = d.totalSize + (Preferences.getDTA("prealloc", true) ? d.totalSize : Prefs.maxChunkSize);
				}
				var realDest;
				try {
					var realDest = new FileFactory(d.dirSave);
					if (!realDest.exists()) realDest.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0766);
				} catch(e) {
					Debug.dump("downloadChunk(): Could not move file or create directory on destination path: ", e);
					failDownload(d, strbundle.getString("accesserror"), strbundle.getString("permissions") + " " + strbundle.getString("destpath") + strbundle.getString("checkperm"), strbundle.getString("accesserror"));
					return;
				}
				
				nds = realDest.diskSpaceAvailable;
				if (nds < tsd) {
					Debug.dump("There is not enought free space available on destination directory, needed=" + tsd + " (totalsize="+ d.totalSize +"), user=" + nsd);
					failDownload(d, strbundle.getString("ndsa"), strbundle.getString("spacedir"), strbundle.getString("freespace"));
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

				// se scopriamo che e' possibile effettuare multipart blocchiamo il chunk e ricominciamo in multipart
				if (d.isResumable && d.totalSize > 2 * Prefs.minChunkSize && d.maxChunks > 1) {
					// in case of a redirect set the new real url
					if (this.url != aRequest.URI.spec) {
						d.urlManager.replace(this.url, new DTA_URL(aRequest.URI.spec, visitor.overrideCharset ? visitor.overrideCharset : d.urlManager.charset));
					}
					Debug.dump(d.fileName + ": Let's stop single chunk and start multipart!");
					c.progressPersist.cancelSave();
					return;
				} else {
					// altrimenti il chunk di prova diventa quello definitivo
					Debug.dump(d.fileName + ": Multipart downloading is not needed/possible. isResumable = " + d.isResumable);
					d.maxChunks = 1;
					c.end = d.totalSize - 1;
					this.isHeaderHack = false;
				}
			} else {
				Debug.dump(d.fileName + ": Chunk " + c.start + "-" + + c.end + " started");
			}

			d.checkFilenameConflict();

			if (!d.totalSize && d.chunks.length == 1 && aMaxTotalProgress>0)
				d.totalSize = Number(aMaxTotalProgress);

			d.setTreeProgress("inprogress", 0);

			if (!d.totalSize)
				this.cantCount = 1;
			
			popup();
		}

		// update download tree row
		if (!d.isCanceled) {

			c.chunkSize = aCurTotalProgress;
			d.refreshPartialSize();
			
			Check.refreshDownloadedBytes();

			if (this.cantCount != 1)
			{
				// basic integrity check
				if (d.partialSize > d.totalSize) {
					Debug.dump(d.fileName + ": partialSize > totalSize" + "(" + d.partialSize + "/" +  d.totalSize + "/" + ( d.partialSize -  d.totalSize) + ")");
					failDownload(d, "Size mismatch", "Actual size of " + d.partialSize + " does not match reported size of " + d.totalSize, "Size mismatch");
					//d.hasToBeRedownloaded = true;
					//d.redownloadIsResumable = false;
					//d.setPaused();
					return;
				}
				d.setTreeProgress("inprogress", Math.round(d.partialSize / d.totalSize * 100));
				d.setTreeCell("percent", Math.round(d.partialSize / d.totalSize * 100) + "%");
				d.setTreeCell("size", d.createDimensionString());
			} else {
				d.setTreeCell("percent", "???");
				d.setTreeCell("size", d.createDimensionString());
				d.setTreeCell("status", strbundle.getString("downloading"));
			}
		}
		// else: do nothing
	} catch(e) {Debug.dump("onProgressChange():", e);}
}
};

// --------* Gzip converter *--------

function dataListener(outStream, outFileManager, dest, d) {
  this.outf = outStream;
  this.outFM = outFileManager;
  this.inf=dest;
  this.d=d;
}

dataListener.prototype = {
	error : false,
	QueryInterface : function(iid) {
		if (
			iid.equals(Components.interfaces.nsISupports)
			|| iid.equals(Components.interfaces.nsIStreamListener)
			|| iid.equals(Components.interfaces.nsIRequestObserver)
		) 
			return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	onStartRequest : function(request, context) {
		Debug.dump(this.d.fileName + ": Decompression started");
	},
	onStopRequest : function(request, context, status) {
		this.outf.close();
		
		if (this.d.isRemoved) {
			Stats.zippedToWait--;
		} else {
			this.d.isPassed = true
			Stats.passedNumber++;
			Stats.zippedToWait--;
			this.d.setTreeCell("percent", "100%");
			this.d.setTreeCell("status", strbundle.getString("complete"));
			this.d.setTreeProgress("completed", 100);
		}
		
		if (status == Components.results.NS_OK && !this.error) {
		
			Debug.dump(this.d.fileName + ": Remove: " + this.inf.path + "\nKeep " + this.outFM.path);
			this.inf.remove(false);
			
		} else {
			// if we have an error decompression we assume an erroneous GZIP header response and keep the original file!
			Debug.dump(this.d.fileName + ": Rename: " + this.inf.path + "\nRemove erroneous: " + this.outFM.path);
			
			this.outFM.remove(false);
			var destination = cc["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
			destination.initWithPath(this.d.dirSave);
			
			try {
				if (!destination.exists()) destination.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0766);
				this.inf.moveTo(destination, this.d.destinationName);
			} catch(e) {
				failDownload(this.d, strbundle.getString("accesserror"), strbundle.getString("permissions") + " " + strbundle.getString("destpath") + strbundle.getString("checkperm"), strbundle.getString("accesserror"));
				Debug.dump("dataListener::onStopRequest: Could not move file or create directory: ", e);
				return;
			}
		}
		
		// Garbage collection
		this.d.chunks = null;
		
		Debug.dump(this.d.fileName + ": Decompression completed");
		
		Check.checkClose();
		popup();
	},
	onDataAvailable : function(request, context, inputStream, offset, count) {
		try {
			// update tree row
			this.d.setTreeCell("percent", Math.round(offset / this.d.totalSize * 100) + "%");
			this.d.setTreeProgress("inprogress", Math.round(offset / this.d.totalSize * 100));
			// write decompressed data
			var byteStream = cc['@mozilla.org/binaryinputstream;1'].createInstance(Components.interfaces.nsIBinaryInputStream);
			byteStream.setInputStream(inputStream);
			// we're using nsIFileOutputStream
			if (this.outf.write(byteStream.readBytes(count), count) != count) {
				throw ("dataDecodeListener::dataAvailable: read/write count mismatch!");
			}
		} catch(e) {
			this.error = true;
			request.cancel(Components.results.NS_BINDING_ABORTED);
			Debug.dump("onDataAvailable():", e);
		}
	}
}

// --------* Inizio funzioni *--------

//--> attivata all'onload

function loadDown() {

	strbundle = $("strings");
	Prefs.refresh();
	
	document.getElementById("dtaHelp").hidden = !("openHelp" in window);
	
	sessionManager.load();
	
	// update status and window title
	$("status").label = strbundle.getFormattedString("cdownloads", [Stats.completedDownloads, downloadList.length]);
	document.title = Stats.completedDownloads + "/" + downloadList.length + " - DownThemAll!";

	if ("arguments" in window) {
		startnewDownloads(window.arguments[0], window.arguments[1]);
	} else
		$("listDownload0").view.selection.currentIndex = $("listDownload0").view.rowCount - 1;
	
	try {
		clearTimeout(Check.timerCheck);
		clearTimeout(Check.timerRefresh);
		Check.checkDownloads();
		Check.refreshGUI();
	} catch (e) {}
	
	popup();
}

function removeTab(url) {
try {
	var enumerator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		.getService(Components.interfaces.nsIWindowMediator)
		.getEnumerator("navigator:browser");
		
	var useRM = false;
	try {
		var ver = Components.classes["@mozilla.org/xre/app-info;1"]
			.getService(Components.interfaces.nsIXULAppInfo)
			.platformVersion;
		var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
			.getService(Components.interfaces.nsIVersionComparator);
		useRM = versionChecker.compare(ver, "1.8") < 0;
	} catch (ex) {
		// nothing to do here.
		// seems to be an old version of Gecko/XRE.
	}

	var chk = function(tab, url) {
		if (tab.currentURI.spec == url || tab.contentWindow.location == url) {
			return tab;
		}
		
		var frames = tab.contentWindow.frames;
		if (frames && frames.length) {
			for (var i = 0; i<frames.length; i++) {
				if (frames[i].location && frames[i].location == url) {
					return tab;
				}
			}
		}

		return null;
	};

	// Check each browser instance for our URL
	var numBrowsers = 0;
	while (enumerator.hasMoreElements()) {
		var win = enumerator.getNext();
		var browser = win.getBrowser();

		var numTabs = browser.browsers.length;
		
		// likely its the selected tab.
		var tab = chk(browser.selectedBrowser, url);
		if (!tab) {
			// Check each tab of this browser instance
			for (var i = 0; i < numTabs; ++i) {
				tab = chk(browser.getBrowserAtIndex(i), url);
				if (tab) {
					break;
				}
			}
		}
		if (tab)
		{
			// If referrer == page to remove && if we have more than a tab
			if (useRM || numTabs > 1)
			{
				browser.removeTab(tab);
			} else if (numBrowsers || enumerator.hasMoreElements()){
				win.close();
			}	else {
				// this is the 1.8.0 way
				browser.addTab('about:blank');
				browser.removeTab(tab);
			}
			return;
		}
    numBrowsers++;
  }
} catch(e) {Debug.dump("removeTab(): ", e);}
}

function cancelAll(pressedESC) {

	// if we have non-resumable running downloads...
	if (!Check.isClosing) {
		var rFlag=false;
		
		for (var i=0; i<downloadList.length; i++) {
			if (downloadList[i].isStarted && !downloadList[i].isResumable && downloadList[i].isRunning && !downloadList[i].isPaused)	{
				rFlag=true;
				break;
			}
		}
		if (rFlag) {
			var promptService = cc["@mozilla.org/embedcomp/prompt-service;1"]
				.getService(Components.interfaces.nsIPromptService);
			var rv = promptService.confirm(
				window,
				strbundle.getString("confclose"),
				strbundle.getString("nonres")
			);
			if (!rv) {
				return false;		
			}
		}
	} else if (sessionManager.iHaveToClose)
		return true;
	
	Check.isClosing = true;
	
	if (Stats.passedNumber != downloadList.length || Stats.zippedToWait != 0) {
		for (var i=0; i<downloadList.length; i++) {
			var d = downloadList[i];
			// completed and passed files are already managed
			if (d.isPassed || d.isCompleted) continue;
			// also canceled and paused without running joinings
			if (d.isCanceled || (d.isPaused && (d.join == null || !d.join.imJoining))) {
				d.isPassed = true;
				Stats.passedNumber++;
			} else if (d.isStarted) {
				// also non-running downloads
				if (!d.isRunning) {
					d.isPassed = true;
					Stats.passedNumber++;
				} else {
					// running downloads have to be paused/stopped
					d.setPaused();
					d.isPaused = true;
					d.setTreeCell("status", strbundle.getString("closing"));
					Debug.dump(d.fileName + " has to be stopped.");
				}
			} else {
				// in queue downloads are already managed
				if (Prefs.onClosingSaveAborted) {
					d.isPaused = true;
					d.isPassed = true;
					Stats.passedNumber++;
				} else
					removeFromList(i);
			}
			// close join stream
			if (d.join && !d.join.imJoining) {
				d.join.closeStream();
			}
		}
	}
	
	Debug.dump("Passed=" + Stats.passedNumber + "/" + downloadList.length);
	
	// if we can close window now, let's close it
	if (Stats.passedNumber == downloadList.length && Stats.zippedToWait == 0) {
		Debug.dump("cancelAll(): Disclosure of window permitted");
		sessionManager.save(true);
		clearTimeout(Check.timerRefresh);
		clearTimeout(Check.timerCheck);
	} else
		Debug.dump("cancelAll(): We're waiting...");
	
	return false;
}

function startnewDownloads(notQueue, download) {

	var numbefore = $("listDownload0").view.rowCount - 1;
	
	for (var i=0; i<download.length; i++) {
		var e = download[i];
		// uniformita' slash finale
		e.dirSave.addFinalSlash();
		
		var desc = "";
		if (("description" in download[i]) && download[i].description.length>0)
			desc = e.description;
		else if ("ultDescription" in download[i])
			desc = e.ultDescription;
			
		var startDate = new Date();
		var d = new downloadElement(e.url, e.dirSave, e.numIstance, desc, e.mask, e.refPage);
		d.isPaused = !notQueue;
		d.startDate = startDate;
		downloadList.push(d);
	
		// aggiunge i relativi elementi in listbox
		populateListbox(d);
	}
	
	sessionManager.save();
	
	if (Preferences.getDTA("closetab", false)) {
		removeTab(d.refPage.spec);
	}
	
	Check.haveToCheck = true;
	
	// porto in visibile i file che si stanno scaricando
	var boxobject = $("listDownload0").treeBoxObject;
	boxobject.QueryInterface(Components.interfaces.nsITreeBoxObject);
	if (download.length <= boxobject.getPageLength())
		boxobject.scrollToRow($("listDownload0").view.rowCount - boxobject.getPageLength());
	else 
		boxobject.scrollToRow(numbefore);
	
	$("listDownload0").view.selection.currentIndex = numbefore + 1;
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

//--> aggiunge alla listbox gli elementi in array
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
	
	if (d.isCompleted) {
			time.setAttribute("label", strbundle.getString("complete"));
			per1.setAttribute("properties", "completed");
	} else if (d.isPaused && !d.isCanceled) {
			time.setAttribute("label", strbundle.getString("paused"));
			per1.setAttribute("properties", "paused");
	} else if (d.isCanceled) {
			time.setAttribute("label", strbundle.getString("canceled"));
			per1.setAttribute("properties", "canceled");
	} else {
			time.setAttribute("label", strbundle.getString("inqueue"));
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
	lista.addEventListener("dblclick", openFile, true);
}

function isLinkType (linktype, link) {
	try {
		var protocol = link.substr(0, linktype.length);
		return protocol.toLowerCase() == linktype;
	} catch(e) {
		return false;
	}
}

// fa partire lo scaricamento dei chunk in multipart
function downloadMultipart(d) {

try {
	Prefs.refresh();
	var numChunk = d.maxChunks;
	
	// multipart
	if ((d.totalSize / numChunk) < Prefs.minChunkSize) {
		// serve un numero inferiore a numChunk di chunks
		numChunk = Math.round(d.totalSize / Prefs.minChunkSize);
	}
	
	var endLastChunk;
	var stChunkSize = Math.round(d.totalSize / numChunk);
	if (stChunkSize > Prefs.maxChunkSize) {
		stChunkSize = Prefs.maxChunkSize;
		endLastChunk = stChunkSize * numChunk - 1;
	} else {
		endLastChunk = d.totalSize - 1;
	}
	Debug.dump("downloadMultipart(): I'm splitting " + d.fileName + " (" + d.totalSize + "B) into " + numChunk + " chunks of " + stChunkSize + "B");
	
	for (var i = 0; i < (numChunk-1); i++) {
		downloadChunk(stChunkSize * i, (stChunkSize * (i + 1)) - 1, d, i - 1, false);
	}
	
	downloadChunk(stChunkSize * i, endLastChunk, d, i - 1, false); // l'ultimo va fino alla fine
}catch(e) {
	Debug.dump("downloadMultipart():", e);
}
}

function isInProgress(path, d) {
	for (var x=0; x<inProgressList.length; x++)
		if ((inProgressList[x].d.dirSave + inProgressList[x].d.destinationName) == path && d != inProgressList[x].d)
			return x;
	return -1;
}

function askForRenaming(t, s1, s2, s3) {
	Prefs.refresh();
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

function downloadChunk(start, end, d, fatherChunk, testHeader) {
	const nsIWBP = Components.interfaces.nsIWebBrowserPersist;
	try {
		var c = new chunkElement(start, end, d);
		var chunkIndex = d.chunks.push(c) - 1;

		c.isRunning = true;
		d.isRunning = true;

		// fatherChunk e' il chunk precendente al punto nel quale vogliamo inserire il nuovo chunk
		if (fatherChunk != -1) {
			c.previous = fatherChunk;
		if (d.chunks[fatherChunk].next != -1) {
			c.next = d.chunks[fatherChunk].next;
			var nextpadre = d.chunks[fatherChunk].next;
			d.chunks[nextpadre].previous = chunkIndex;
		}
		d.chunks[fatherChunk].next = chunkIndex;
	}
	
		var time = new Date();
		// nome file temporaneo
		var baseChunkName = "dtatempfile"+ (time.getTime() + Math.floor(10000 * (Math.random() % 1))) +".part" + chunkIndex;
		var realDest;
		var xx=0;
	
		var stringerror;
		do {
			realDest = Prefs.tempLocation?(Prefs.tempLocation.clone()):(new FileFactory(d.dirSave));
		
			if (xx==0)
				c.chunkName = baseChunkName;
			else
				c.chunkName = makeNumber(xx) + "_" + baseChunkName;	
			
			try {
				if (!realDest.exists()) {
					realDest.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0766);
				}
			} catch(ex) {
				throw ("Failed to create directory: " + realDest.path + ", " + ex);
			}

			realDest.append(c.chunkName);
			xx++;
		} while (realDest.exists());

		// to check write permissions 
		try {
			var testfile = realDest.clone();
			testfile.create(testfile.NORMAL_FILE_TYPE, 0766);
			testfile.remove(false);
		}
		catch(ex) {
			throw ("Testfile failed: " + realDest.path + ", " + ex);		
		}

		c.fileManager = realDest;
	
		var url = d.urlManager.getURL();
		var uri = cc['@mozilla.org/network/standard-url;1'].createInstance(Components.interfaces.nsIURI);
		uri.spec = url.url;

		/*if ("user" in d && d.user.length > 0 && "pass" in d && d.pass.length > 0) {
			uri.username = d.user;
			uri.password = d.pass;
		}*/
	
		c.progressPersist = cc['@mozilla.org/embedding/browser/nsWebBrowserPersist;1']
			.createInstance(Components.interfaces.nsIWebBrowserPersist);

		var flags = nsIWBP.PERSIST_FLAGS_NO_CONVERSION | nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES | nsIWBP.PERSIST_FLAGS_BYPASS_CACHE;
		c.progressPersist.persistFlags = flags;
		c.progressPersist.progressListener = new PersistProgressListener(chunkIndex, c, d, testHeader);

		var header = "Accept-Encoding: none\r\n";
		if (end) {
			header += "Range: bytes=" + start + "-" + end + "\r\n";
		}
		c.progressPersist.saveURI(uri, null, d.refPage, null, header, c.fileManager);

		if (!testHeader) {
			Debug.dump(d.fileName + ": Created chunk of range " + start + "-" + end);
		}
		else {
			Debug.dump(d.fileName + ": Created Header Chunk Test (" + start + "-" + end + ")");
		}
	
		d.setTreeCell("parts", 	(++d.declaratedChunks) + "/" + d.maxChunks);
		
	} catch (ex) {

		Debug.dump("downloadChunk():", ex);
		failDownload(
			d,
			strbundle.getString("errordownload"),
			strbundle.getFormattedString("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]),
			strbundle.getString("errordownload")
		);
	
		d.isRunning = false;
		d.removeFromInProgressList();
	}
}

function makeNumber(number) {
	var stringa="";	
	if (number <= 9)
		{ stringa = "00" + number;}
	else if (number <= 99 && number >= 10)
		{ stringa = "0" + number;}
	else
		{stringa = number;}
	return stringa;
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
	if (Check.imRemoving) return;
	var objects = new Array();
	
	var tree = $("listDownload0");
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
	$("tooladd", "tooldonate", "toolprefs", 'misc', 'prefs').forEach(enableObj);
	
	if (tree.view.rowCount > 0)
		$("removeCompleted", "selectall", "selectinv").forEach(enableObj);
		
	if (objects.length==0) return;
	
	for (var c=0; c<objects.length; c++) {
		var d = objects[c];
		
		if (!d || typeof(d) != "object") continue;
		
		// se non e' cancellato, non e' in pausa, non e' completato,
		// e se e' un file e' gia' iniziato
		if (
			(!d.isCanceled)&&(!d.isPaused)&&(!d.isCompleted)
			&& (
				(d.isRunning && d.isResumable)
				||
				(!d.isRunning)
				)
		)
			$("pause", "toolpause").forEach(enableObj);
		
		// se non e' cancellato, e' in pausa, non e' completato,
		// e se e' un file e' gia' iniziato
		if (
			(!d.isCanceled && d.isPaused && !d.isCompleted && d.isResumable)
			||
			(!d.isRunning && d.isCanceled )
			||
			(d.isPaused && !d.isStarted)
		)
			$("play", "toolplay").forEach(enableObj);

		if (!d.isCanceled && ((d.isCompleted && d.isPassed) || !d.isCompleted))
			$("cancel", "toolcancel").forEach(enableObj);
			
		if (d.isCompleted)
			$('folder', 'launch', 'delete').forEach(enableObj);

		if ((!d.isCanceled)&&(!d.isCompleted)&&(d.declaratedChunks > 1)&&(d.isResumable))
			enableObj($("removechunk"));
			
		if ((!d.isCanceled)&&(!d.isCompleted)&&(d.declaratedChunks < 10)&&(d.isResumable))
			enableObj($("addchunk"));
	}
	
 	$("movetop", "toolmovetop", "movebottom", "toolmovebottom", "moveup", 
		"toolmoveup", "movedown", "toolmovedown", "info", "remove").forEach(enableObj);

} catch(e) {Debug.dump("popup()", e)}
}

//--> attivato dal click su context o toolbar
function pauseResumeReq(pauseReq) {
try {
	var tree = $("listDownload0");
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
				// se e' effettivamente da pausare
				if (
					(!d.isCanceled)&&(!d.isPaused)&&(!d.isCompleted)
					&& (
						((d.partialSize != 0)&&(d.isResumable))
						||
						(d.partialSize == 0)
					)
				) {
					d.setTreeCell("status", strbundle.getString("paused"));
					d.setTreeCell("speed", "");
					d.setTreeProgress("paused");
					
					if (d.isFirst) Check.setFirstInQueue();
					
					d.isPaused = true;
					d.setPaused();
				}
			} else {
				// se e' effettivamente da resumare
				if (
					(!d.isCanceled)&&(d.isPaused)&&(!d.isCompleted)
					&& (
						((d.partialSize != 0)&&(d.isResumable))
						||
						(d.partialSize == 0)
					)
				) {
					firstFlag = true;
					d.isPaused = false;
					d.setTreeCell("status", strbundle.getString("inqueue"));
					d.setTreeProgress("queued");
				} else if (!d.isRunning && d.isCanceled) {

					// e' stato cancellato, glielo faccio ripiacere a getfirstfreefile
					firstFlag = true;
					if (d.isPassed) {
						d.isPassed = false;
						Stats.passedNumber--;
					}
					var n = new downloadElement(
							d.urlManager, 
							String(d.originalDirSave), 
							Number(d.numIstance),
							String(d.description), 
							String(d.mask), 
							String(d.refPage.spec)
						);
					n.startDate = new Date(d.startDate.toUTCString());
					n.treeID = String(d.treeID);
					
					downloadList.splice(c, 1, n);
					d.setTreeCell("status", strbundle.getString("inqueue"));
				}
				Check.haveToCheck = true;
				if (((Check.firstInQueue == -1) || (Check.firstInQueue > c)) && firstFlag)  {
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

//--> si occupa di decidere se uno spazio vuoto deve essere scaricato tramite un solo chunk o ri-suddiviso in un massimo di downloadsLeft chunks
function startSubChunks(start, end, firstindex, lastindex, downloadsLeft, d) {
	
	if (downloadsLeft == 0) return 0;
	
	var numChunk = downloadsLeft;

	var size = end - start;
	
	if (size <= 2 * Prefs.minChunkSize || downloadsLeft == 1) {
		// non e' possibile eseguire il multipart o il file e' troppo piccolo
		downloadChunk(start, (size>Prefs.maxChunkSize)?(start+Prefs.maxChunkSize):end, d, firstindex, false);
		return downloadsLeft - 1;
	} else {
 
		// multipart
		if ((size / numChunk) < Prefs.minChunkSize) {
			// serve un numero inferiore a numChunk di chunks
			numChunk = Math.round(size / Prefs.minChunkSize);
		}
		
		var endLastChunk;
		var stChunkSize = Math.round(size / numChunk);
		if (stChunkSize > Prefs.maxChunkSize) {
			stChunkSize = Prefs.maxChunkSize;
			endLastChunk = start + stChunkSize * numChunk - 1;
		} else
			endLastChunk = end;
			
		for (var i = 0; i<(numChunk-1); i++)
			downloadChunk(start + stChunkSize * i, start + (stChunkSize * (i + 1)) - 1, d, (i==0)?firstindex:(d.chunks.length-1), false);
		
		downloadChunk(start + stChunkSize * i, endLastChunk, d, d.chunks.length - 1, false); // l'ultimo va fino alla fine
		
		// nell'inserimento multiplo l'ultimo deve essere collegato con lastindex
		if (lastindex != -1)
			d.chunks[lastindex].previous = d.chunks.length-1;
		
		return downloadsLeft - numChunk;
	}
	
	return 0;
}


function sortByDimension(a,b) {
  if((a.end - a.start) > (b.end - b.start)) return 1;
  if((a.end - a.start) < (b.end - b.start)) return -1;
  return 0;
}


//--> attivato dal click su context o toolbar
function cancelPopup() {
	var tree = $("listDownload0");
	var rangeCount = tree.view.selection.getRangeCount();
	
	for(var i=rangeCount-1; i>=0; i--) {
		var start = {};
		var end = {};
		tree.view.selection.getRangeAt(i,start,end);
		// ciclo gli elementi selezionati
		for(var c=end.value; c>=start.value; c--) {
			// se e' effettivamente da cancellare
			if (!downloadList[c].isCanceled && ((downloadList[c].isCompleted && downloadList[c].isPassed) || !downloadList[c].isCompleted))
				downloadList[c].cancelDownload();
		}
	}
}
	
function removeFromList(index) {
	Check.imRemoving = true;
	
	if (index < 0) {
		var tree = $("listDownload0");
		var start;
		var end;
		var rangeCount = tree.view.selection.getRangeCount();
		var order = new Array();
		for (var i=rangeCount-1; i>=0; i--) {
			start = {}; end = {};
			tree.view.selection.getRangeAt(i, start, end);
			for (var c=end.value; c>=start.value; c--) {
				order.push(c);
			}
		}
		order.forEach(removeElement);
	} else 
		removeElement(index);
	
	Check.imRemoving = false;
	popup();
}

function removeCompleted() {
	Check.imRemoving = true;
	for (var i=downloadList.length-1; i>=0; i--) {
		if (downloadList[i].isCompleted) removeElement(i);
	}
	Check.imRemoving = false;
}

function removeElement(index) {
	if (downloadList[index].isFirst)
		Check.setFirstInQueue();
	else if (index < Check.firstInQueue)
		Check.firstInQueue--;
	
	setRemoved(downloadList[index]);
	downloadList.splice(index, 1);
}


function setRemoved(d) {
	try {
	d.isRemoved = true;
	if (!d.isCanceled)
		d.isCanceled = true;
		
	if (d.join == null || !d.join.imJoining) {
		$("downfigli").removeChild($(d.treeID));
		if (d.isCompleted) {
			Stats.completedDownloads--;
		}
		
		if (!d.isStarted || d.isCompleted) {
			if (!d.isPassed) {
				d.isPassed = true;
				Stats.passedNumber++;
			 }
		} else {
			if (d.setIsRunning()) {
				d.setPaused();
			} else if (d.join != null && d.join.imJoining) {
				d.join.stopJoining();
			} else if(!d.isPassed) {
				d.isPassed = true;
				Stats.passedNumber++;
	  	}
			d.cancelFamily();
		}
	} else {
		d.join.stopJoining();
	}
	
	if (d.isPassed) {
	   d.isPassed = false;
	   Stats.passedNumber--;
	}	
	
} catch(e) {
	Debug.dump("setRemoved():", e);
}
Check.checkClose();
}

function getInfo() {

	// store all selected downloads
	var tree = $("listDownload0");
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
Check.imRemoving = true;
try {
	var tree = $("listDownload0");
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
			  var beforePos = 0;
			  
			if ((beforePos <= Check.firstInQueue)&&(!downloadList[beforePos].isRunning)&&(!downloadList[beforePos].isPaused)&&(!downloadList[beforePos].isCanceled)&&(!downloadList[beforePos].isCompleted)) {
				  oldfirst.isFirst = false;
				  Check.firstInQueue = beforePos;
				  downloadList[beforePos].isFirst = true;
			  }
			 else if (datas[i] > Check.firstInQueue && beforePos <= Check.firstInQueue) Check.firstInQueue++;
			}
			else {
			  var beforePos = downloadList.length; // bottom
			  if (datas[i] == Check.firstInQueue) {
				  for (var dex = datas[i]; dex < beforePos; dex++) {
					if ((!downloadList[dex].isRunning)&&(!downloadList[dex].isPaused)&&(!downloadList[dex].isCanceled)&&(!downloadList[dex].isCompleted)) {
					  oldfirst.isFirst = false;
					  Check.firstInQueue = dex;
					  downloadList[dex].isFirst = true;
					  break;
					}
				  }
				}
			  else 
				if (datas[i]<Check.firstInQueue && beforePos > Check.firstInQueue ) Check.firstInQueue--;
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
Check.imRemoving = false;
}

//--> Richiamata dal context, muove di n posizioni la selezione corrente
//	  pos < 0 equivale a spostare verso l'alto di pos posizioni
function move(pos) {
	Check.imRemoving = true;
	try {
		var tree = $("listDownload0");
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
			  
			if ((beforePos <= Check.firstInQueue)&&(!downloadList[beforePos].isRunning)&&(!downloadList[beforePos].isPaused)&&(!downloadList[beforePos].isCanceled)&&(!downloadList[beforePos].isCompleted)) {
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
					if ((!downloadList[dex].isRunning)&&(!downloadList[dex].isPaused)&&(!downloadList[dex].isCanceled)&&(!downloadList[dex].isCompleted)) {
					  oldfirst.isFirst = false;
					  Check.firstInQueue = dex;
					  downloadList[dex].isFirst = true;
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
	Check.imRemoving = false;
}

//--> Richiamata dal context, apre la directory target
function openFolder() {
	var tree = $("listDownload0");
	var rangeCount = tree.view.selection.getRangeCount();
	for(var i=0; i<rangeCount; i++) {
		var start = {}; var end = {};
		tree.view.selection.getRangeAt(i,start,end);
		// ciclo gli elementi selezionati
		for(var c=start.value; c<=end.value; c++) {
			var dir = cc["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
			if (downloadList[c].isCompleted) {
				try {
					dir.initWithPath(downloadList[c].dirSave + downloadList[c].destinationName);
					dir.reveal();
				} catch (e){}
			} else {
				try {
					dir.initWithPath(downloadList[c].dirSave);
					dir.reveal();
				} catch (e){}
			}
		}
	}
}

//--> Richiamata dal doppio click, apre il file
function openFile(event) {
	var lastSon = $("listDownload0").currentIndex;
	if (downloadList[lastSon].isCompleted) {
		var dir = cc["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
		try {
			dir.initWithPath(downloadList[lastSon].dirSave + downloadList[lastSon].destinationName);
			dir.launch();
		} catch (e){}
	}
}
function deleteFile() {
	var idx = $("listDownload0").currentIndex;
	var download = downloadList[idx];
	if (!download.isCompleted) {
		return;
	}
	try {
		var file = new FileFactory(download.dirSave + download.destinationName);
		if (file.exists() && confirm("Sure to delete '" + file.path + "'?")) {
			file.remove(false);
			removeFromList(idx);
		}
	}
	catch (ex) {
		Debug.dump('deleteFile: ' + download.destinationName, ex);
	}
}

//--> Richiamata dal context, seleziona tutto
function selectAll() {
		var tree = $("listDownload0");
		tree.view.selection.selectAll();
}

//--> Richiamata dal context, inverte la selezione
function selectInv() {
	var tree = $("listDownload0");
	for (var x = 0; x<tree.view.rowCount; x++) {
		if (tree.view.selection.isSelected(x))
			tree.view.selection.toggleSelect(x);
		else
			tree.view.selection.rangedSelect(x, x, true);
	}
}

//--> Richiamata dal context, aumenta o diminuisce di uno il numero di chunks
function addChunk(add) {
	var tree = $("listDownload0");
	var rangeCount = tree.view.selection.getRangeCount();
	
	for(var i=0; i<rangeCount; i++) {
		 var start = {};
		 var end = {};
		 tree.view.selection.getRangeAt(i,start,end);
		 
		 // ciclo gli elementi selezionati
		 for(var c=start.value; c<=end.value; c++) {
			
			if (!add && downloadList[c].maxChunks > 1) {
				--downloadList[c].maxChunks;
				Debug.dump(downloadList[c].fileName + ": User removed a chunk");
				if (downloadList[c].declaratedChunks > downloadList[c].maxChunks && downloadList[c].isRunning)
					for (var i=(downloadList[c].chunks.length-1); i>=0; i--)
						if (downloadList[c].chunks[i].isRunning) {
							downloadList[c].chunks[i].progressPersist.cancelSave();
							break;
						}
			} else if (add && downloadList[c].maxChunks < 10) {
				Debug.dump(downloadList[c].fileName + ": User added a chunk");
				++downloadList[c].maxChunks;
				var d = downloadList[c];
				if (!d.isPaused && d.isRunning && (!('imWaitingToRearrange' in d) || !d.imWaitingToRearrange) && !d.resumeDownload()) {
				
					// trovo il chunk piu' grande con scaricamento in corso
					var j = null;
					for (var x=0; x<d.chunks.length; x++) 
						if (d.chunks[x].isRunning) {
							if (j==null)
								j=d.chunks[x];
							else if ((j.end - j.start - j.chunkSize) < (d.chunks[x].end - d.chunks[x].start))
								j = d.chunks[x];
						}
					// se il chunk piu' grosso potrebbe venire scaricato in piu' di una parte
					if (Math.round((j.end - j.start - j.chunkSize) / Prefs.minChunkSize) > 1) {
						Debug.dump(downloadList[c].fileName + ": Rearrange chunk " + j.start + "-" + j.end);
						// blocco il chunk in questione 
						d.imWaitingToRearrange = true;
						j.imWaitingToRearrange = true;
						j.progressPersist.cancelSave();
					} else
						Debug.dump(downloadList[c].fileName + ": It's not possible to use the chunk added");
				}
			}
			downloadList[c].setTreeCell("parts", downloadList[c].declaratedChunks + "/" + downloadList[c].maxChunks);
		}
	}
}

var sessionManager = {
	imSaving : false,
	repeat : false,
	iHaveToClose : false,
	byteOut : null,
	fileOutput : null,
	
	QueryInterface : function(iid) {
		if(
			iid.equals(Components.interfaces.nsISupports)
			|| iid.equals(Components.interfaces.nsIStreamListener)
			|| iid.equals(Components.interfaces.nsIRequestObserver)
		)
			return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	onStartRequest : function(request, context) {
		// create output file
		this.fileOutput = cc['@mozilla.org/network/file-output-stream;1'].createInstance(Components.interfaces.nsIFileOutputStream);
		this.fileOutput.init(DTA_profileFile.get('dta_history.xml'), 0x02 | 0x08 | 0x20, 0664, 0);
		this.byteOut = cc['@mozilla.org/binaryoutputstream;1'].createInstance(Components.interfaces.nsIBinaryOutputStream);
		this.byteOut.setOutputStream(this.fileOutput);
	},
	onStopRequest : function(request, context, status) {
		// close output file
		this.fileOutput.close();
		this.byteOut.close();
		
		this.imSaving = false;
		// if there has been a new call to saveSession during saving process
		if (this.repeat) {
			this.repeat = false;
			this.save();
		} else if (this.iHaveToClose) {
			Debug.dump("I'm closing :)");
			self.close();
		}
	},
	onDataAvailable : function(request, context, inputStream, offset, count) {try{
		var byteStream = cc['@mozilla.org/binaryinputstream;1'].createInstance(Components.interfaces.nsIBinaryInputStream);
		byteStream.setInputStream(inputStream);
		var data = byteStream.readBytes(count);
		// write data
		this.byteOut.writeBytes(data, count);
		} catch(e) {alert(e);}
	},
	
	save: function(andClose) {
	
		if (andClose) this.iHaveToClose=true;
		
		if (this.imSaving) {
			this.repeat = true;
			return;
		}
		this.imSaving = true;

		try {
		var doc = document.implementation.createDocument("", "", null);
		var list = doc.createElement("downloads");
		
		Prefs.refresh();
		for (var i=0; i<downloadList.length; i++) {
			
			var d = downloadList[i];
			
			if (!(
				(Prefs.onClosingSaveCompleted && d.isCompleted) || 
				(Prefs.onClosingSaveCanceled && d.isCanceled) || 
				(Prefs.onClosingSaveAborted && !d.isStarted) || 
				d.isPaused || 
				d.setIsRunning())
			) continue;
			
			var e = doc.createElement("download");

			e.set = e.setAttribute;
			[
				'fileName',
				'destinationName',
				'numIstance',
				'description', 
				'isResumable', 
				'alreadyMaskedName', 
				'alreadyMaskedDir',
				'mask',
				'originalDirSave'
			].forEach(function(u) { e.set(u, d[u]); });
			
			e.set("dirsave", d.dirSave.addFinalSlash());
			e.set("referrer", d.refPage.spec);
			e.set("startDate", d.startDate.toUTCString());

			d.urlManager.save(e);
			d.visitors.save(e);
			
			if (!d.isResumable && !d.isCompleted) {
				e.set("partialsize", 0);
				e.set("totalsize", 0);
			} else {
				e.set("partialsize", d.partialSize);
				e.set("totalsize", d.totalSize);
			}

			e.set("completed", d.isCompleted);
			e.set("canceled", d.isCanceled);
			
			if (!d.isCanceled && !d.isCompleted && d.chunks.length > 0) {
				var x = d.firstChunk;
				do {
					if (!d.chunks[x].isRunning && d.chunks[x].chunkSize != 0) {
						var chunk = doc.createElement("chunk");
						chunk.setAttribute("path", d.chunks[x].fileManager.path);
						chunk.setAttribute("start", d.chunks[x].start);
						chunk.setAttribute("end", d.chunks[x].end);
						chunk.setAttribute("size", d.chunks[x].chunkSize);
						e.appendChild(chunk);
					}
					x = d.chunks[x].next;
				} while(x != -1);
			}
			list.appendChild(e);
		}
		
		// create xml string
		doc.appendChild(list);
		var serializer = new XMLSerializer();
		var s = serializer.serializeToString(doc);

		var converter = Components.classes["@mozilla.org/intl/saveascharset;1"]
			.createInstance(Components.interfaces.nsISaveAsCharset);
		converter.Init('utf-8', 1, 0);
		s = converter.Convert(s);

		// create async input stream
		var sInputStream = Components.classes["@mozilla.org/io/string-input-stream;1"].createInstance(Components.interfaces.nsIStringInputStream);
		var inputPump = Components.classes["@mozilla.org/network/input-stream-pump;1"].createInstance(Components.interfaces.nsIInputStreamPump);
		inputPump.init(sInputStream, 0, -1, 0, 0, true);
		sInputStream.setData(s, s.length);
		
		// start copying
		inputPump.asyncRead(this, null);
		
		} catch(e) {Debug.dump("sessionManager.save():", e);}
	},
	
	get: function(down, attr) {
		if (down.hasAttribute(attr)) {
			return down.getAttribute(attr);
		}
		return null;
	},
	load: function() {try {
	
		var file = DTA_profileFile.get('dta_history.xml');
		if (!file.exists()) return;
		Prefs.refresh();
		
		// read file
		// and parse the xml
		var fiStream = cc['@mozilla.org/network/file-input-stream;1'].createInstance(Components.interfaces.nsIFileInputStream);
		fiStream.init(file, 1, 0, false);
		var domParser = new DOMParser();
		var doc = domParser.parseFromStream(fiStream, 'utf-8', file.fileSize, "application/xml");
		fiStream.close();
		var list = doc.documentElement.getElementsByTagName("download");
		
		// load session
		for (var k=0; k<list.length; k++) {try {
			var down = list[k];
			
			if (!(
					(Prefs.onClosingSaveCompleted && down.getAttribute("completed")=="true") || 
					(Prefs.onClosingSaveCanceled && down.getAttribute("canceled")=="true") || 
					(this.get(down, "canceled")=="false" && this.get(down, "completed")=="false")
				)) continue;
			
			var d = new downloadElement(
				new DTA_URLManager(down),
				this.get(down, "dirsave"),
				this.get(down, "numIstance"),
				this.get(down, "description"),
				this.get(down, "mask"),
				this.get(down, "referrer")
				);
			d.startDate = new Date(this.get(down, "startDate"));
			d.visitors.load(down)	;
			
			d.fileName = this.get(down, "fileName");
			d.destinationName = this.get(down, "destinationName");
			d.originalDirSave = this.get(down, "originalDirSave");
			d.isResumable = this.get(down, "isResumable")=="true" ? true:false;
			d.isCanceled = this.get(down, "canceled")=="true" ? true:false;
			d.isCompleted = this.get(down, "completed")=="true" ? true:false;
			d.partialSize = parseInt(this.get(down, "partialsize"));
			d.totalSize = parseInt(this.get(down, "totalsize"));
			d.alreadyMaskedName = this.get(down, "alreadyMaskedName")=="true" ? true:false;
			d.alreadyMaskedDir = this.get(down, "alreadyMaskedDir")=="true" ? true:false;
	

			if (d.partialSize == 0)
				d.isStarted = false;
			else
				d.isStarted = true;
			
			if (!d.isCanceled && !d.isCompleted) {
				d.isPaused = true;
				var chunks = down.getElementsByTagName('chunk');
				for (var x = 0; x < chunks.length; x++) {
					var chunkEl = chunks[x];
					var test = new FileFactory(chunkEl.getAttribute("path"));
					if (test.exists()) {
						var i = d.chunks.length;
						d.chunks.push(
							new chunkElement(
								parseInt(chunkEl.getAttribute("start")),
								parseInt(chunkEl.getAttribute("start"))
									+ parseInt(chunkEl.getAttribute("size"))
									-1
								, d
							)
						);
						d.chunks[i].isRunning = false;
						d.chunks[i].chunkSize = parseInt(chunkEl.getAttribute("size"));
						
						d.chunks[i].previous = i - 1;
						// adjusted below.
						d.chunks[i].next = i + 1;	

						d.chunks[i].fileManager = test;
					} 
					else if (d.chunks.length == 1) {
						// only finished chunks get saved.
						// one missing therefore means it already got joined
						d.chunks[0].chunkSize += parseInt(chunkEl.getAttribute("size"));
						d.chunks[0].end += parseInt(chunkEl.getAttribute("size"));
						Debug.dump("sessionManager::load: missing chunk");
					}
				}
				d.refreshPartialSize();
				
				if (d.chunks.length > 0) {
					// adjust the end.
					d.chunks[d.chunks.length - 1].next = -1;	
					d.join = new joinListener(d);
				}
				
			} else if (d.isCompleted) {
					d.fileManager = new FileFactory(d.dirSave);
					d.fileManager.append(d.destinationName);
					d.dirSave = d.dirSave;
					Stats.completedDownloads++;
					d.isPassed = true;
					Stats.passedNumber++;
					
			} else if (d.isCanceled) {
				d.isPassed = true;
				Stats.passedNumber++;
			}
			
			downloadList.push(d);
			populateListbox(d);
		} catch (e) {Debug.dump("Error loading " + this.get(down, "filename") + ":", e);}
	}
	} catch(e) {Debug.dump("sessionManager.load():", e);}
	}
};

function tooltipInfo(event) {
try {
		var result;
		var row = new Object;
		var column = new Object;
		var part = new Object;

		var tree = $("listDownload0");
		
		var boxobject = tree.treeBoxObject;
		boxobject.QueryInterface(Components.interfaces.nsITreeBoxObject);
		boxobject.getCellAt(event.clientX, event.clientY, row, column, part);
		
		if (row.value == -1) 
				return false;
		
		var arrayComp = cc['@mozilla.org/supports-array;1'].createInstance();
		var properties = arrayComp.QueryInterface(Components.interfaces.nsISupportsArray);
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
	if (file==null) return;
	
	var c = file.firstChunk;
	var d = $("drawChunks").getContext("2d");
	
	d.clearRect(0,0,300,20);

	var prog = d.createLinearGradient(0,0,0,16);
	prog.addColorStop(0, 'rgba(96,165,1,255)');
	prog.addColorStop(1, 'rgba(123,214,1,255)');
	
	var compl = d.createLinearGradient(0,0,0,16);
	compl.addColorStop(0, 'rgba(13,141,15,255)');
	compl.addColorStop(1, 'rgba(0,199,56,255)');
	
	var join = "#A5FE2C";
	
	var cancel = d.createLinearGradient(0,0,0,16);
	cancel.addColorStop(0, 'rgba(151,58,2,100)');
	cancel.addColorStop(1, 'rgba(255,0,0,100)');
	
	var normal = d.createLinearGradient(0,0,0,16);
	normal.addColorStop(0, 'rgba(255,255,255,50)');
	normal.addColorStop(1, '#DBF2CC');
	
	d.fillStyle = normal;
	d.fillRect(0,0,300,20);

	if (file.isCompleted) {
		d.fillStyle = compl;
		d.fillRect(0,0,300,20);
		d.fillStyle = join;
		if (file.join == null)
			d.fillRect(0,16,300,4);
		else
			d.fillRect(0,16,Math.ceil(file.join.offset/file.totalSize*300),4);
	} else if (file.isCanceled) {
		d.fillStyle = cancel;
		d.fillRect(0,0,300,20);
	} else if (file.isStarted) {
		while (c != -1) {
			d.fillStyle=prog;
			d.fillRect(Math.ceil(file.chunks[c].start/file.totalSize*300),0,Math.ceil(file.chunks[c].chunkSize/file.totalSize*300),20);
			c = file.chunks[c].next;
		}
		d.fillStyle = join;
		if (file.join == null)
			d.fillRect(0,16,Math.ceil(file.chunks[file.firstChunk].chunkSize/file.totalSize*300),4);
		else
			d.fillRect(0,16,Math.ceil(file.join.offset/file.totalSize*300),4);
	}

	setTimeout("updateChunkCanvas()", Check.frequencyUpdateChunkGraphs);
	
} catch(e) { Debug.dump("updateChunkCanvas(): ", e); }
}

function stopCanvas() {Prefs.currentTooltip=null;}
