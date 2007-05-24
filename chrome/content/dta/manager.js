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

// true if window has focus
var winFocus = false;
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

const MIN_CHUNK_SIZE = 204800; // 200kb
const MAX_CHUNK_SIZE = 10485760; // 10MB
const SPEED_COUNT = 25;

var Prefs = {
	// default values
	showOnlyFilenames: true,
	alertingSystem: 0,

	// conflict filenames preference for this session (-1 not setted)
	askEveryTime: true,
	sessionPreference: -1,
	onConflictingFilenames: 3,

	maxInProgress: 5,
	maxChunks: 5,
	tempLocation: null,

	currentTooltip: null,

	removeCompleted: true,
	removeAborted: false,
	removeCanceled: false,

	// nsIObserver
	observe: function(subject, topic, prefName) {
		this._refreshPrefs();
	},

	init: function() {
		makeObserver(this);

		try {
			this.observe();
			var pbi = Cc['@mozilla.org/preferences-service;1']
				.getService(Ci.nsIPrefService)
				.getBranch(null)
				.QueryInterface(Components.interfaces.nsIPrefBranch2)
			;
			pbi.addObserver('extensions.dta.', this, true);
			pbi.addObserver('network.', this, true);
		}
		catch (ex) {
			Debug.dump("failed to add pref-observer", ex);
		}
	},

	_refreshPrefs: function() {
		Debug.dump("pref reload");

		this.removeCompleted = Preferences.getDTA("removecompleted", true);
		this.removeAborted = Preferences.getDTA('removeaborted', false);
		this.removeCanceled = Preferences.getDTA("removecanceled", false);

		this.maxInProgress = Preferences.getDTA("ntask", 5);
		this.maxChunks = Preferences.getDTA("maxchunks", 5);
		this.showOnlyFilenames = Preferences.getDTA("showOnlyFilenames", true);
		this.onConflictingFilenames = Preferences.getDTA("existing", 3);
		this.alertingSystem = Preferences.getDTA("alertbox", (SYSTEMSLASH == '\\') ? 1 : 0);

		if (Preferences.get("saveTemp", true)) {
			try {
				this.tempLocation = Preferences.getMultiByteDTA("tempLocation", '');
				if (this.tempLocation == '') {
					// #44: generate a default tmp dir on per-profile basis
					// hash the profD, as it would be otherwise a minor information leak
					var dsp = Cc["@mozilla.org/file/directory_service;1"]
						.getService(Ci.nsIProperties);
					this.tempLocation = dsp.get("TmpD", Ci.nsIFile);
					var profD = hash(dsp.get("ProfD", Ci.nsIFile).leafName);
					this.tempLocation.append("dtatmp-" + profD);
					Debug.dump(this.tempLocation.path);
				} else {
					this.tempLocation = new FileFactory(this.tempLocation);
				}
			} catch (ex) {
				this.tempLocation = null;
				// XXX: error handling
			}
		}
		var conns = (this.maxInProgress * this.maxChunks + 2) * 2;
		[
			'network.http.max-connections',
			'network.http.max-connections-per-server',
			'network.http.max-persistent-connections-per-server'
		].forEach(
			function(e) {
				if (conns > Preferences.get(e, conns)) {
					Preferences.set(e, conns);
				}
				conns /= 2;
			}
		);
	}
}
Prefs.init();

// --------* Statistiche *--------
var Stats = {
	totalDownloads: 0,

	// XXX/DC Debug this crap,
	_completedDownloads: 0,
	get completedDownloads() { return this._completedDownloads; },
	set completedDownloads(nv) { if (0 > (this._completedDownloads = nv)) { throw "Stats::Completed downloads less than 1"; } },

	zippedToWait: 0,
	downloadedBytes: 0
}

function DTA_URLManager(urls) {
	this._urls = [];
	this._idx = 0;

	if (urls instanceof Array) {
		this.initByArray(urls);
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
	dontacceptrange: false,
	contentlength: 0,

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
					this.dontacceptrange = (aValue.toLowerCase().indexOf('none') >= 0);
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
					Debug.dump("found fn:" + this.fileName);
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
				throw (x + " is missing");
			}
			// header is there, but differs
			else if (this[x] != v[x]) {
				Debug.dump(x + " nm: [" + this[x] + "] [" + v[x] + "]");
				throw ("Header " + x + "doesn't match");
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

function VisitorManager() {
	this._visitors = {};
}
VisitorManager.prototype = {

	load: function vm_init(nodes) {
		for (var i = 0; i < nodes.length; ++i) {
			try {
				this._visitors[nodes[i].url] = new Visitor(nodes[i].values);
			} catch (ex) {
				Debug.dump("failed to read one visitor", ex);
			}
		}
	},
	save: function vm_save(node) {
		var rv = [];
		for (x in this._visitors) {
			var v = {};
			v.url = x;
			v.values = this._visitors[x].save();
			rv.push(v);
		}
		return rv;
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
	next: -1,
	previous: -1,
	isJoining: false,
	isRunning: false,
	chunkSize: 0,
	chunkName: "",
	fileManager: null,
	progressPersist: null,
	imWaitingToRearrange: false,
	getSize: function() {
		try {
			if (this.fileManager.exists())
				return this.fileManager.fileSize;
			else
				Debug.dump("chunkElement::getSize(): File doesn't exists!");
		} catch (e) {Debug.dump("chunkElement::getSize(): ", e);}
		return 0;
	},
	remove: function() {
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
	this.refPage = Cc['@mozilla.org/network/standard-url;1'].createInstance(Ci.nsIURI);
	this.refPage.spec = refPage;
}

downloadElement.prototype = {
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

	isCanceled: false,
	isPaused: false,
	isCompleted: false,
	isResumable: false,
	isRunning: false,
	isStarted: false,
	isPassed: false,
	isRemoved: false,

	isFirst: false,

	fileManager: null,
	declaratedChunks: 0,
	maxChunks: null,
	firstChunk: 0,

	timeLastProgress: 0,
	timeStart: 0,
	join: null,

	get icon() {
		return getIcon(this.fileName, 'metalink' in this);
	},
	get largeIcon() {
		return getIcon(this.fileName, 'metalink' in this, 32);
	},

	imWaitingToRearrange: false,

	hasToBeRedownloaded: false,
	reDownload: function() {
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

	getHeader: function() {
		Debug.dump(this.urlManager.url + " (" + this.refPage.spec +"): getHeader()");
		this.maxChunks = Prefs.maxChunks;
		downloadChunk(0, 0, this, -1, true);
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

	cancelFamily: function() {
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

	setIsRunning: function() {
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

	refreshPartialSize: function(){
		var size = 0;
		for (var i = 0; i<this.chunks.length; i++)
			size += this.chunks[i].chunkSize;
		this.partialSize = size;
		return size;
	},

	setPaused: function(){
		for (var i = 0; i<this.chunks.length; i++)
			if (this.chunks[i].isRunning && this.chunks[i].progressPersist)
				this.chunks[i].progressPersist.cancelSave();
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

	moveCompleted: function(fileManager) {

		if (this.join) {
			this.join.closeStream();
		}
		if (this.isCanceled) {
			return;
		}

		// increment completedDownloads counter
		this.isCompleted = true;
		Stats.completedDownloads++;

		try {
			var destination = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
			destination.initWithPath(this.dirSave);
			Debug.dump(this.fileName + ": Move " + fileManager.path + " to " + this.dirSave + this.destinationName);

			if (!destination.exists()) {
				destination.create(Ci.nsIFile.DIRECTORY_TYPE, 0766);
			}
			this.checkFilenameConflict();
			var destinationName = (this.compression)?("[comp]"+this.destinationName):this.destinationName;

			// move file
			fileManager.moveTo(destination, destinationName);

		} catch(ex) {
			failDownload(this, _("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
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

			var fiStream = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
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
	finishDownload: function() {

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
				this.setTreeCell("status", _("decompressing"));
				try {
					this.unzip();
				} catch(e){
					Debug.dump("finishDownload():", e);
				}
			}
			return;
		}

		this.isPassed = true;
		this.setTreeCell("status", _("complete"));
		popup();

		// Garbage collection
		this.chunks = null;
	},

	unzip: function() {try {
		Debug.dump(this.fileName + ": Unzip: unzip into " + this.dirSave + this.destinationName + " from source " + this.fileManager.path);

		// create a channel from the zipped file
		var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
		var fileURI = ios.newFileURI(this.fileManager);
		var channel = ios.newChannelFromURI(fileURI);

		// initialize output file
		var nomeFileOut = new FileFactory(this.dirSave + this.destinationName);

		try {
			nomeFileOut.create(nomeFileOut.NORMAL_FILE_TYPE, 0766);
		} catch(e) {
			failDownload(this, _("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
			Debug.dump("unzip(): Could not move file or create directory: ", e);
			return;
		}

		var fileUscita = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
		fileUscita.init(nomeFileOut, 0x02 | 0x08, 0766, 0);

		// set up the gzip converter
		var listener = new dataListener(fileUscita, nomeFileOut, this.fileManager, this);
		var converter = Cc["@mozilla.org/streamconv;1?from="+this.compressionType+"&to=uncompressed"].createInstance(Ci.nsIStreamConverter);
		if ("AsyncConvertData" in converter)
			converter.AsyncConvertData(this.compressionType, "uncompressed", listener, null);
		else
			converter.asyncConvertData(this.compressionType, "uncompressed", listener, null);

		// start the conversion
		channel.asyncOpen(converter,null);

	} catch (e) {Debug.dump("Unzip():", e);}
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
		if (!this.isCompleted && this.isRunning) {
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
		else if (this.isCompleted && !this.isPassed) {
			if (realDest.exists()) {
				s = askForRenaming(
					_("alreadyexists", [this.destinationName, this.dirSave]) + " " + _("whatdoyoucomplete", [shortUrl]),
					{caption:_("reninto", [newDest]), value:0}, {caption:_("overwrite"), value:1}, {caption:_("cancel"), value:4}
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
				this.cancelDownload(_("skipped"));
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

	cancelDownload: function(message) {try {
		if (!this.isCanceled) {
			Debug.dump(this.fileName + ": cancelDownload()");

			this.visitors = new VisitorManager();

			if (this.isFirst) {
				Check.setFirstInQueue();
			}
			this.isCanceled = true;

			if (message == "" || !message) {
				message = _("canceled");
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

	resumeDownload: function () {try {

		if (!("length" in this.chunks) || this.chunks.length==0) {
			this.getHeader();
			return false;
		}

		if (this.maxChunks == null) {
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
	createDimensionString: function() {
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

	stopRequest: null,
	imJoining: false,
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

	next: function JL_next() {
		return this.d.chunks[this.current].next;
	},

	stopJoining: function JL_stopJoining(c) {
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
		var outStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
		outStream.init(this.fileManager, 0x04 | 0x08, 0766, 0);
		this.outStream = outStream.QueryInterface(Ci.nsISeekableStream);
		if (Preferences.getDTA("prealloc", true) && this.fileManager.fileSize != this.d.totalSize) {
			this.dump('trying to prealloc', this.d.firstChunk);
			this.outStream.seek(0x00, this.d.totalSize);
			this.outStream.setEOF();
		}

		this.outStream.seek(0x00, this.offset);

		// seek does not work correctly :p
		if (this.outStream.tell() != this.offset) {
			this.dump("tell mismatch" + this.offset + "/" + this.outStream.tell() + "/" + (this.offset - this.outStream.tell()));
			this.d.cancelDownload();
		}

		if (this.next() != -1)
			this.join(this.next());
	},

	join: function JL_join(c) {try {

		this.dump('join request', c);
		if (!this.outStream) {
			throw ("No outstream");
		}

		if (c != this.next() || this.d.chunks[c].isRunning || this.imJoining) return;
		if ((this.d.chunks[c].start - this.d.chunks[this.current].end) != 1) return;
		if (!this.d.chunks[c].fileManager.exists()) return;

		this.imJoining = this.d.chunks[this.current].isJoining = this.d.chunks[c].isJoining = true;
		var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

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

	joinIsFinished: function JL_jobIsFinished(chunk) {
		this.imJoining = false;
		this.d.chunks[this.current].isJoining = this.d.chunks[chunk].isJoining = false;

		// are we canceled now?
		if (this.d.isCanceled) {
			this.closeStream();

			Debug.dump("JoinIsFinished: Cancelling " + this.d.fileName);
			this.d.isPassed = true;
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
			this.dump("tell() mismatch: " + this.offset + "/" + this.outStream.tell() + "/" + (this.offset - this.outStream.tell()));
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
	error: false,
	myOffset: 0,

	QueryInterface: function DCL_QueryInterface(iid) {
		if(
			iid.equals(Ci.nsISupports)
			|| iid.equals(Ci.nsIStreamListener)
			|| iid.equals(Ci.nsIRequestObserver)
		) return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
 	},

	onStartRequest: function DCL_onStartRequest(request, context) {
		this.join.stopRequest = request;
	},

	onStopRequest: function DCL_onStopRequest(request, context, status) {
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

	onDataAvailable: function DCL_onDataAvailable(request, context, inputStream, offset, count) {try {

		this.join.offset = this.oldoffset + offset;
		if (this.d.isCompleted && !this.d.isCanceled && !this.d.isRemoved) {
			this.d.setTreeCell("percent", Math.round(this.join.offset / this.d.totalSize * 100) + "%");
			this.d.setTreeProgress("inprogress", Math.round(this.join.offset / this.d.totalSize * 100));
			if (Check.isClosing)
				this.d.setTreeCell("status", _("completing"));
			else
				this.d.setTreeCell("status", _("joining"));
		}
		// need to wrap this as nsIInputStream::read is marked non-scriptable.
		var byteStream = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
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

	Utils.playSound("error");

	switch (Prefs.alertingSystem) {
		case 1:
			AlertService.show(title, msg, false);
			break;
		case 0:
			alert(msg);
			break;
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

var AlertService = {
	_alerting: false,
	_init: function() {
		if ('@mozilla.org/alerts-service;1' in Cc && 'nsIAlertsService' in Ci) {
			// some systems do not have this service
			try {
				this._service = Cc['@mozilla.org/alerts-service;1'].getService(Ci.nsIAlertsService);
				makeObserver(this);
			}
			catch (ex) {
				// no-op
			}
			return null;
		}
	},
	_service: null,
	show: function(title, msg, clickable, cookie) {
		if (this._alerting || !this._service) {
			return;
		}
		this._alerting = true;
		this._service.showAlertNotification(
			"chrome://dta/skin/common/alert.png",
			title,
			msg,
			clickable,
			cookie,
			this
			);
	},
	observe: function (aSubject, aTopic, aData) {
		switch (aTopic) {
			case "alertfinished":
				// global variable
				this._alerting = false;
				break;
			case "alertclickcallback":
				if (aData != "errore") {
					try {
						OpenExternal.launch(aData);
					}
					catch (ex) {
						// no-op
					}
				}
				break;
		}
	}
};
AlertService._init();

// --------* Controlli di chiusura e avvio nuovi downloads *--------

var Check = {
	imRemoving: false,
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
			if (d.partialSize != 0 && !d.isPaused && !d.isCanceled && !d.isCompleted && (data.getTime() - d.timeStart) >= 1000 ) {
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
				if (d.speeds.length > SPEED_COUNT) {
					d.speeds.shift();
				}

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
					d.isPaused = true;
					d.setTreeCell("status", _("timeout"));
					d.setTreeProgress("paused");
				} else
					d.cancelDownload(_("timeout"));

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
				|| Stats.zippedToWait
			) {
				return;
			}

			Debug.dump("checkClose(): All downloads passed correctly");
			this.lastCheck = Stats.downloadedBytes;

			Utils.playSound("done");

			// if windows hasn't focus, show FF sidebox/alerts
			if (!winFocus && Stats.completedDownloads > 0) {
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

	startNextDownload: function () {try {

		var i = this.firstInQueue;
		if (i == -1) {
			return;
		}

		var d = downloadList[i];

		d.setTreeCell("status", _("starting"));

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
	cantCount: 0,
	isPassedOnProgress: false,

	init: function() {},
	destroy: function() {},

	onLocationChange: function (aWebProgress, aRequest, aLocation) {},
	onStatusChange: function (aWebProgress, aRequest, aStatus, aMessage) {},
	onSecurityChange: function (aWebProgress, aRequest, aState) {},

	QueryInterface: function(aIID) {
		if (
			aIID.equals(Ci.nsISupports)
			|| aIID.equals(Ci.nsIWebProgressListener2)
			|| aIID.equals(Ci.nsIAuthPromptProvider)
			|| aIID.equals(Ci.nsIAuthPrompt)
		) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	// nsIAuthPromptProvider
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

onStateChange: function (aWebProgress, aRequest, aStateFlags, aStatus) {try {

	if (!(aStateFlags & Ci.nsIWebProgressListener.STATE_STOP)) return;

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

	// check if we're complete now
	if (d.totalSize == 0) {
		// if contentlength is unknown..
		d.isCompleted = d.partialSize != 0 && !d.isRunning && !d.isPaused;
	} else {
		// bugfix #14525
		d.isCompleted = Math.abs(d.partialSize - d.totalSize) < 2;
	}

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

			if (Check.isClosing && !d.isRemoved) {
				d.isPassed = true;
			} else if (!this.isPassedOnProgress)
				failDownload(
				d,
				_("srver"),
				_("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]),
				_("srver")
				);

			d.removeFromInProgressList();
			popup();
			Check.checkClose();
		}
		sessionManager.save(d);
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
		sessionManager.save(d);
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
		sessionManager.save(d);
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
		d.setTreeCell("status", _("srver"));
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
			_("srver"),
			_("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]),
			_("srver")
		);
		sessionManager.save(d);
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
			if (!d.isRemoved) {
				d.isPassed = true;
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
			if (Math.round((j.end - j.start - j.chunkSize) / MIN_CHUNK_SIZE) > 1) {
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
				d.isPassed = true;
				d.chunks = new Array();
			}
		}
		Check.checkClose();
	}

	sessionManager.save(d);
	// refresh GUI
	popup();

	// Garbage Collection
	c.progressPersist = null;

} catch(ex) {Debug.dump("onStateChange():", ex)}
},

onProgressChange64: function (aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
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

		if (d.isPaused || d.isCanceled) {
			c.progressPersist.cancelSave();
			if (d.isCanceled) {
				c.remove();
			}
			return;
		}

		d.timeLastProgress = new Date().getTime();

		if (firstProgress) {

			try {var chan = aRequest.QueryInterface(Ci.nsIHttpChannel);} catch(e) {}

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
				_("error", [chan.responseStatus]),
				_("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]) + " " + _("sra", [chan.responseStatus]) + ": " + chan.responseStatusText,
				_("error", [chan.responseStatus])
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
					var tst = d.totalSize + (Preferences.getDTA("prealloc", true) ? d.totalSize : MAX_CHUNK_SIZE);
					nds = Prefs.tempLocation.diskSpaceAvailable
					if (nds < tst) {
						Debug.dump("There is not enought free space available on temporary directory, needed=" + tst + " (totalsize="+ d.totalSize +"), user=" + nds);
						failDownload(d, _("ndsa"), _("spacetemp"), _("freespace"));
						return;
					}
				}	else {
					tsd = d.totalSize + (Preferences.getDTA("prealloc", true) ? d.totalSize : MAX_CHUNK_SIZE);
				}
				var realDest;
				try {
					var realDest = new FileFactory(d.dirSave);
					if (!realDest.exists()) realDest.create(Ci.nsIFile.DIRECTORY_TYPE, 0766);
				} catch(e) {
					Debug.dump("downloadChunk(): Could not move file or create directory on destination path: ", e);
					failDownload(d, _("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
					return;
				}

				nds = realDest.diskSpaceAvailable;
				if (nds < tsd) {
					Debug.dump("There is not enought free space available on destination directory, needed=" + tsd + " (totalsize="+ d.totalSize +"), user=" + nsd);
					failDownload(d, _("ndsa"), _("spacedir"), _("freespace"));
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
				if (d.isResumable && d.totalSize > 2 * MIN_CHUNK_SIZE && d.maxChunks > 1) {
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
					Debug.dump(d.fileName + ": partialSize > totalSize" + "(" + d.partialSize + "/" + d.totalSize + "/" + ( d.partialSize - d.totalSize) + ")");
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
				d.setTreeCell("status", _("downloading"));
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
	error: false,
	QueryInterface: function(iid) {
		if (
			iid.equals(Ci.nsISupports)
			|| iid.equals(Ci.nsIStreamListener)
			|| iid.equals(Ci.nsIRequestObserver)
		)
			return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	onStartRequest: function(request, context) {
		Debug.dump(this.d.fileName + ": Decompression started");
	},
	onStopRequest: function(request, context, status) {
		this.outf.close();

		if (this.d.isRemoved) {
			Stats.zippedToWait--;
		} else {
			this.d.isPassed = true
			Stats.zippedToWait--;
			this.d.setTreeCell("percent", "100%");
			this.d.setTreeCell("status", _("complete"));
			this.d.setTreeProgress("completed", 100);
		}

		if (status == Components.results.NS_OK && !this.error) {

			Debug.dump(this.d.fileName + ": Remove: " + this.inf.path + "\nKeep " + this.outFM.path);
			this.inf.remove(false);

		} else {
			// if we have an error decompression we assume an erroneous GZIP header response and keep the original file!
			Debug.dump(this.d.fileName + ": Rename: " + this.inf.path + "\nRemove erroneous: " + this.outFM.path);

			this.outFM.remove(false);
			var destination = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
			destination.initWithPath(this.d.dirSave);

			try {
				if (!destination.exists()) destination.create(Ci.nsIFile.DIRECTORY_TYPE, 0766);
				this.inf.moveTo(destination, this.d.destinationName);
			} catch(e) {
				failDownload(this.d, _("accesserror"), _("permissions") + " " + _("destpath") + _("checkperm"), _("accesserror"));
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
	onDataAvailable: function(request, context, inputStream, offset, count) {
		try {
			// update tree row
			this.d.setTreeCell("percent", Math.round(offset / this.d.totalSize * 100) + "%");
			this.d.setTreeProgress("inprogress", Math.round(offset / this.d.totalSize * 100));
			// write decompressed data
			var byteStream = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
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

function cancelAll(pressedESC) {

	// if we have non-resumable running downloads...
	if (!Check.isClosing) {
		var rFlag = false;

		for (var i=0; i<downloadList.length; i++) {
			if (downloadList[i].isStarted && !downloadList[i].isResumable && downloadList[i].isRunning && !downloadList[i].isPaused)	{
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
			// close join stream
			if (d.join && !d.join.imJoining) {
				d.join.closeStream();
				d.join = null;
			}
			if (
				d.isCanceled
				|| (d.isPaused && (d.join == null || !d.join.imJoining))
				|| (d.isStarted && !d.isRunning)
			) {
				d.isPassed = true;
			}
			if (d.isPassed || d.isCompleted) {
				return true;
			}

			// also canceled and paused without running joinings
			if (d.isStarted) {
				d.setPaused();
				d.isPaused = true;
				d.setTreeCell("status", _("closing"));
				Debug.dump(d.fileName + " has to be stopped.");
			}
			else if (removeAborted) {
				removeFromList(i);
				return true;
			}
			else {
				d.isPaused = true;
				d.isPassed = true;
				return true;
			}
			return false;
		}
	);

	// if we can close window now, let's close it
	if (allPassed && Stats.zippedToWait == 0) {
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

	var numbefore = $("listDownload0").view.rowCount - 1;
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
		d.isPaused = !notQueue;
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
	var boxobject = $("listDownload0").treeBoxObject;
	boxobject.QueryInterface(Ci.nsITreeBoxObject);
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
			time.setAttribute("label", _("complete"));
			per1.setAttribute("properties", "completed");
	} else if (d.isPaused && !d.isCanceled) {
			time.setAttribute("label", _("paused"));
			per1.setAttribute("properties", "paused");
	} else if (d.isCanceled) {
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
	lista.addEventListener("dblclick", openFile, true);
}

// fa partire lo scaricamento dei chunk in multipart
function downloadMultipart(d) {
	try {
		var numChunk = d.maxChunks;

		// multipart
		if ((d.totalSize / numChunk) < MIN_CHUNK_SIZE) {
			// serve un numero inferiore a numChunk di chunks
			numChunk = Math.round(d.totalSize / MIN_CHUNK_SIZE);
		}

		var endLastChunk;
		var stChunkSize = Math.round(d.totalSize / numChunk);
		if (stChunkSize > MAX_CHUNK_SIZE) {
			stChunkSize = MAX_CHUNK_SIZE;
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
	const nsIWBP = Ci.nsIWebBrowserPersist;
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
					realDest.create(Ci.nsIFile.DIRECTORY_TYPE, 0766);
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
		var uri = Cc['@mozilla.org/network/standard-url;1'].createInstance(Ci.nsIURI);
		uri.spec = url.url;

		/*if ("user" in d && d.user.length > 0 && "pass" in d && d.pass.length > 0) {
			uri.username = d.user;
			uri.password = d.pass;
		}*/

		c.progressPersist = Cc['@mozilla.org/embedding/browser/nsWebBrowserPersist;1']
			.createInstance(Ci.nsIWebBrowserPersist);

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
			_("errordownload"),
			_("failed", [((d.fileName.length>50)?(d.fileName.substring(0, 50)+"..."):d.fileName)]),
			_("errordownload")
		);

		d.isRunning = false;
		d.removeFromInProgressList();
	}
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
	if (Check.imRemoving) return;
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
					d.setTreeCell("status", _("paused"));
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
					d.setTreeCell("status", _("inqueue"));
					d.setTreeProgress("queued");
				} else if (!d.isRunning && d.isCanceled) {

					// e' stato cancellato, glielo faccio ripiacere a getfirstfreefile
					firstFlag = true;
					if (d.isPassed) {
						d.isPassed = false;
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
					d.setTreeCell("status", _("inqueue"));
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

//--> si occupa di decidere se uno spazio vuoto deve essere scaricato tramite un solo chunk o ri-suddiviso in un massimo di downloadsLeft chunks
function startSubChunks(start, end, firstindex, lastindex, downloadsLeft, d) {

	if (downloadsLeft == 0) return 0;

	var numChunk = downloadsLeft;

	var size = end - start;

	if (size <= 2 * MIN_CHUNK_SIZE || downloadsLeft == 1) {
		// non e' possibile eseguire il multipart o il file e' troppo piccolo
		downloadChunk(start, (size > MAX_CHUNK_SIZE)?(start + MAX_CHUNK_SIZE):end, d, firstindex, false);
		return downloadsLeft - 1;
	} else {

		// multipart
		if ((size / numChunk) < MIN_CHUNK_SIZE) {
			// serve un numero inferiore a numChunk di chunks
			numChunk = Math.round(size / MIN_CHUNK_SIZE);
		}

		var endLastChunk;
		var stChunkSize = Math.round(size / numChunk);
		if (stChunkSize > MAX_CHUNK_SIZE) {
			stChunkSize = MAX_CHUNK_SIZE;
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

//--> attivato dal click su context o toolbar
function cancelPopup() {
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

function removeFromList() {
	Check.imRemoving = true;

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

			Check.imRemoving = false;
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
	Check.imRemoving = false;
	popup();
}

function removeCompleted() {
	Check.imRemoving = true;
	sessionManager.beginUpdate();
	for (var i=downloadList.length-1; i>=0; i--) {
		if (downloadList[i].isCompleted) {
			removeElement(i);
		}
	}
	sessionManager.endUpdate();
	Check.imRemoving = false;
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
			 }
		} else {
			if (d.setIsRunning()) {
				d.setPaused();
			} else if (d.join != null && d.join.imJoining) {
				d.join.stopJoining();
			} else if(!d.isPassed) {
				d.isPassed = true;
			}
			d.cancelFamily();
		}
	} else {
		d.join.stopJoining();
	}

	if (d.isPassed) {
		 d.isPassed = false;
	}

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
	Check.imRemoving = true;
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
	Check.imRemoving = false;
}

//--> Richiamata dal context, muove di n posizioni la selezione corrente
// pos < 0 equivale a spostare verso l'alto di pos posizioni
function move(pos) {
	Check.imRemoving = true;
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
	var rangeCount = tree.view.selection.getRangeCount();
	for (var i = 0; i < rangeCount; ++i) {
		var start = {}; var end = {};
		tree.view.selection.getRangeAt(i,start,end);
		for (var c = start.value, e = end.value; c <= e; ++c) {
			try {
				if (downloadList[c].isCompleted) {
					OpenExternal.reveal(downloadList[c].dirSave + downloadList[c].destinationName);
				} else {
					OpenExternal.reveal(downloadList[c].dirSave);
				}
			} catch (ex) {
				Debug.dump('reveal', ex);
			}
		}
	}
}

function openFile(event) {
	var lastSon = $("listDownload0").currentIndex;
	if (downloadList[lastSon].isCompleted) {
		try {
			OpenExternal.launch(downloadList[lastSon].dirSave + downloadList[lastSon].destinationName);
		}
		catch (ex) {
			Debug.dump('launch', ex);
		}
	}
}
function deleteFile() {
	var dellist = [];
	
	var rangeCount = tree.view.selection.getRangeCount();
	for (var i = 0; i < rangeCount; ++i) {
		var start = {}, end = {};
		tree.view.selection.getRangeAt(i, start, end);
		for (var c = start.value, e = end.value; c <= e; ++c) {
			if (downloadList[c].isCompleted) {
				dellist.push(c);
			}
		}
	}
	dellist = dellist.filter(
		function(i) {
			var d = downloadList[i];
			try {
				var file = new FileFactory(d.dirSave + d.destinationName);
				if (file.exists()) {
					if (confirm("Sure to delete '" + file.path + "'?")) {
						file.remove(false);
						return true;
					}
					return false;
				}
				return true;
			}
			catch (ex) {
				Debug.dump('deleteFile: ', ex);
				return false;
			}
		},
		this
	);
	removeFromList(dellist);
}

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
					if (Math.round((j.end - j.start - j.chunkSize) / MIN_CHUNK_SIZE) > 1) {
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

	init: function() {
		this._con = Cc["@mozilla.org/storage/service;1"]
			.getService(Ci.mozIStorageService)
			.openDatabase(DTA_profileFile.get('dta_queue.sqlite'));
		try {
			this._con.executeSimpleSQL('CREATE TABLE queue (uuid INTEGER PRIMARY KEY AUTOINCREMENT, pos INTEGER, item TEXT)');
		} catch (ex) {
			// no-op
		}
		this._saveStmt = this._con.createStatement('REPLACE INTO queue (uuid, pos, item) VALUES (?1, ?2, ?3)');
		this._delStmt = this._con.createStatement('DELETE FROM queue WHERE uuid = ?1');

		this._converter = Components.classes["@mozilla.org/intl/saveascharset;1"]
			.createInstance(Ci.nsISaveAsCharset);
		this._converter.Init('utf-8', 1, 0);
		this._serializer = new XMLSerializer();

		this.load();
	},

	_saveDownload: function(d, pos) {

		if (!(
			(!Prefs.removeCompleted && d.isCompleted) ||
			(!Prefs.removeCanceled && d.isCanceled) ||
			(!Prefs.removeAborted && !d.isStarted) ||
			d.isPaused ||
			d.setIsRunning())
		) {
			return;
		}
		var e = {};
		[
			'fileName',
			'destinationName',
			'numIstance',
			'description',
			'isResumable',
			'alreadyMaskedName',
			'alreadyMaskedDir',
			'mask',
			'originalDirSave',
			'isCompleted',
			'isCanceled'
		].forEach(function(u) { e[u] = d[u]; });

		e.dirsave = d.dirSave.addFinalSlash();
		e.referrer = d.refPage.spec;
		e.startDate = d.startDate.toUTCString();

		e.urlManager = d.urlManager.save();
		e.visitors = d.visitors.save();

		if (!d.isResumable && !d.isCompleted) {
			e.partialSize = 0;
			e.totalSize = 0;
		} else {
			e.partialSize = d.partialSize;
			e.totalSize = d.totalSize;
		}

		e.chunks = [];

		if (!d.isCanceled && !d.isCompleted && d.chunks.length > 0) {
			var x = d.firstChunk;
			do {
				if (!d.chunks[x].isRunning && d.chunks[x].chunkSize != 0) {
					var chunk = {};
					chunk.path = d.chunks[x].fileManager.path;
					chunk.start = d.chunks[x].start;
					chunk.end = d.chunks[x].end;
					chunk.size = d.chunks[x].chunkSize;
					e.chunks.push(chunk);
				}
				x = d.chunks[x].next;
			} while(x != -1);
		}

		var s = this._saveStmt;
		if (d.dbID) {
			s.bindInt64Parameter(0, d.dbID);
		}
		else {
			s.bindNullParameter(0);
		}
		s.bindInt32Parameter(1, pos);
		s.bindUTF8StringParameter(2, this._converter.Convert(e.toSource()));
		s.execute();
		d.dbID = this._con.lastInsertRowID;
	},

	beginUpdate: function() {
		this._con.beginTransactionAs(this._con.TRANSACTION_DEFERRED);		
	},
	endUpdate: function() {
		this._con.commitTransaction();
	},	
	save: function(download) {

		// just one download.
		if (download) {
			this._saveDownload(download);
			return;
		}

		this.beginUpdate();
		try {
			this._con.executeSimpleSQL('DELETE FROM queue');
			downloadList.forEach(
				function(e, i) {
					this._saveDownload(e, i);
				},
				this
			);
		}
		catch (ex) {
			Debug.dump(ex);
		}
		this.endUpdate();

	},
	deleteDownload: function(download) {
		if (!download.dbID) {
			return;
		}
		this._delStmt.bindInt64Parameter(0, download.dbID);
		this._delStmt.execute();
	},

	load: function() {

		const removeCompleted = Prefs.removeCompleted;
		const removeCanceled = Prefs.removeCompleted;

		var stmt = this._con.createStatement('SELECT uuid, item FROM queue ORDER BY pos');

		while (stmt.executeStep()) {
			try {
				const dbID = stmt.getInt64(0);
				var down = eval(stmt.getUTF8String(1));
				var get = function(attr) {
					if (attr in down) {
						return down[attr];
					}
					return null;
				}
				if (
					(removeCompleted && down.completed)
					|| (removeCanceled && down.canceled)
				) {
					continue;
				}

				var d = new downloadElement(
					new DTA_URLManager(down.urlManager),
					get("dirsave"),
					get("numIstance"),
					get("description"),
					get("mask"),
					get("referrer")
					);
				d.dbID = dbID;
				d.startDate = new Date(get("startDate"));
				d.visitors.load(down.visitors);

				[
					'fileName',
					'destinationName',
					'orginalDirSave',
					'isResumable',
					'isCanceled',
					'isCompleted',
					'partialSize',
					'totalSize',
					'alreadyMaskedName',
					'alreadyMaskedDir',
				].forEach(
					function(e) {
						d[e] = get(e);
					}
				);

				d.isStarted = d.partialSize != 0;

				if (!d.isCanceled && !d.isCompleted) {
					d.isPaused = true;
					var chunks = down.chunks;
					for (var i = 0, e = chunks.length; i < e; ++i) {
						var c = chunks[i];
						var test = new FileFactory(c.path);
						if (test.exists()) {
							var i = d.chunks.length;
							d.chunks.push(
								new chunkElement(
									c.start,
									c.start + c.size - 1,
									d
								)
							);
							d.chunks[i].isRunning = false;
							d.chunks[i].chunkSize = c.size;

							d.chunks[i].previous = i - 1;
							// adjusted below.
							d.chunks[i].next = i + 1;

							d.chunks[i].fileManager = test;
						}
						else if (d.chunks.length == 1) {
							// only finished chunks get saved.
							// one missing therefore means it already got joined
							d.chunks[0].chunkSize += c.size;
							d.chunks[0].end += c.size;
							Debug.dump("sessionManager::load: missing chunk");
						}
					}
					d.refreshPartialSize();

					if (d.chunks.length > 0) {
						// adjust the end.
						d.chunks[d.chunks.length - 1].next = -1;
						d.join = new joinListener(d);
					}

				}
				else if (d.isCompleted) {
					d.fileManager = new FileFactory(d.dirSave);
					d.fileManager.append(d.destinationName);
					Stats.completedDownloads++;
					d.isPassed = true;
				}
				else if (d.isCanceled) {
					d.isPassed = true;
				}

				downloadList.push(d);
				populateListbox(d);
			}
			catch (ex) {
				Debug.dump('failed to init a download from queuefile', ex);
			}
		}
	}
};

function tooltipInfo(event) {
	try {
		var result;
		var row = {};


		var boxobject = tree.treeBoxObject;
		boxobject.QueryInterface(Ci.nsITreeBoxObject);
		boxobject.getCellAt(event.clientX, event.clientY, row, {}, {});

		if (row.value == -1) {
			return false;
		}

		var n = row.value;
		var d = downloadList[n];
		$("infoIcon").src = d.largeIcon;
		$("infoURL").value = d.urlManager.url;
		$("infoDest").value = d.dirSave + d.destinationName;

		Prefs.currentTooltip = d;
		updateSpeedCanvas();
		updateChunkCanvas();
		
		return true;
	}
	catch(ex) {
		Debug.dump("tooltipInfo():", ex);
	}
	return false;
}

var Graphics = {
	makeRoundedRectPath: function(ctx,x,y,width,height,radius) {
		ctx.beginPath();
		ctx.moveTo(x,y+radius);
		ctx.lineTo(x,y+height-radius);
		ctx.quadraticCurveTo(x,y+height,x+radius,y+height);
		ctx.lineTo(x+width-radius,y+height);
		ctx.quadraticCurveTo(x+width,y+height,x+width,y+height-radius);
		ctx.lineTo(x+width,y+radius);
		ctx.quadraticCurveTo(x+width,y,x+width-radius,y);
		ctx.lineTo(x+radius,y);
		ctx.quadraticCurveTo(x,y,x,y+radius);
	},
	createVerticalGradient: function(ctx, height, c1, c2) {
		var g = ctx.createLinearGradient(0,0,0,height);
		g.addColorStop(0, c1);
		g.addColorStop(1, c2);
		return g;
	},
	createInnerShadowGradient: function(ctx, w, c1, c2, c3, c4) {
		var g = ctx.createLinearGradient(0,0,0,w);
		g.addColorStop(0, c1);
		g.addColorStop(3.0/w, c2);
		g.addColorStop(4.0/w, c3);
		g.addColorStop(1, c4);
		return g;
	}
};


function updateSpeedCanvas() {
	var file = Prefs.currentTooltip;
	if (!file) {
		return false;
	}
	try {
		// we need to take care about with/height
		var canvas = $("speedCanvas");
		var width = canvas.width = canvas.clientWidth;
		var height = canvas.height = canvas.clientHeight;
		var ctx = canvas.getContext("2d");
		--width; --height;
		
		var boxFillStyle = Graphics.createInnerShadowGradient(ctx, height, "#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4");
		var boxStrokeStyle = Graphics.createInnerShadowGradient(ctx, 8, "#816A1D", "#E7BE34", "#F8CC38", "#D8B231");
		var graphFillStyle = Graphics.createVerticalGradient(ctx, height - 7, "#FF8B00", "#FFDF38");
		
		ctx.clearRect(0, 0, width, height);
		ctx.save();
		ctx.translate(.5, .5);
		
		ctx.lineWidth = 1;
		ctx.strokeStyle = boxStrokeStyle;
		ctx.fillStyle = boxFillStyle;
			
		// draw container chunks back
		ctx.fillStyle = boxFillStyle;
		Graphics.makeRoundedRectPath(ctx, 0, 0, width, height, 5);
		ctx.fill();

		var step = Math.floor(width / (SPEED_COUNT - 1));
		
		if (file.speeds.length > 2) {
			var maxH, minH;
			maxH = minH = file.speeds[0];
			for (var i = 1, e = file.speeds.length; i < e; ++i) {
					if (file.speeds[i] > maxH) maxH = file.speeds[i];
					if (file.speeds[i] < minH) minH = file.speeds[i];
			}
			if (minH == maxH) {
				var s = file.speeds.map(function(speed) { return 12; });
			}
			else {
				var r = (maxH - minH);
				var s = file.speeds.map(function(speed) { return 3 + Math.round((height - 6) * (speed - minH) / r); });
			}
			Debug.dump("step vec: " + s + "\n" + file.speeds);
				
			ctx.save();
			ctx.clip();
			[
				{ x:4, y:0, f:Graphics.createVerticalGradient(ctx, height - 7, "#EADF91", "#F4EFB1") },
				{ x:2, y:0, f:Graphics.createVerticalGradient(ctx, height - 7, "#DFD58A", "#D3CB8B") },
				{ x:1, y:0, f:Graphics.createVerticalGradient(ctx, height - 7, "#D0BA70", "#DFCF6F") },
				{ x:0, y:0, f:graphFillStyle, s:Graphics.createVerticalGradient(ctx, height - 7, "#F98F00", "#FFBF37") }
			].forEach(
				function(pass) {
					ctx.fillStyle = pass.f;
					var y = height + pass.y;
					var x = pass.x + 0.5;
							
					ctx.beginPath();
					ctx.moveTo(x, y);
							
					y = y - s[0];
					ctx.lineTo(x, y);
							
					var slope = (s[1] - s[0]);
					x = x + step * .7;
					y = y - slope * .7;
					ctx.lineTo(x, y);
							
					for (var j = 1, e = s.length - 1; j < e; ++j) {
						x = x + step * .3;
						y = y - slope *.3;
						
						slope = (s[j+1] - s[j]);
						x = x + step * .3;
						y = y - slope * .3;
						ctx.quadraticCurveTo(step * j, height + pass.y - s[j], x, y);
						
						x = x + step * .4;
						y = y - slope * .4;
						ctx.lineTo(x, y);
					}
							
					x = x + step * .3;
					y = y - slope * .3;
					ctx.lineTo(x, y);
					
					ctx.lineTo(x, height);
					ctx.fill();
							
					if (pass.s) {
						ctx.strokeStyle = pass.s;
						ctx.stroke();
					}
					Debug.dump("steps " + [x,y, s[0], s[1]]);
				}
			);
			ctx.restore();
		}
		Graphics.makeRoundedRectPath(ctx, 0, 0, width, height, 3);
		ctx.stroke();
			
		ctx.restore();

		setTimeout("updateSpeedCanvas()", Check.frequencyRefresh);
	}
	catch(ex) {
		Debug.dump("updateSpeedCanvas(): ", ex);
	}
}

function updateChunkCanvas() {
	var file = Prefs.currentTooltip;
	if (!file) {
		return;
	}
	
	try {

		var canvas = $("chunkCanvas");
		var width = canvas.width = canvas.clientWidth;
		var height = canvas.height = canvas.clientHeight;
		var ctx = canvas.getContext("2d");
		--width; --height;
		
		var cheight = height - 9;

		// Create gradients
		var chunkFillStyle = Graphics.createVerticalGradient(ctx, cheight, "#A7D533", "#D3F047");
		var partialFillStyle = Graphics.createVerticalGradient(ctx, 8, "#5BB136", "#A6D73E");
		var boxFillStyle = Graphics.createInnerShadowGradient(ctx, cheight, "#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4");
		var boxStrokeStyle = Graphics.createInnerShadowGradient(ctx, 8, "#816A1D", "#E7BE34", "#F8CC38", "#D8B231");
		var partialBoxFillStyle = Graphics.createInnerShadowGradient(ctx, 8, "#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4");

		// clear all
		ctx.clearRect(0, 0, width, height);
		ctx.save();
		ctx.translate(.5, .5);
		
		// draw container chunks back
		ctx.lineWidth = 1;
		ctx.strokeStyle = boxStrokeStyle;
		ctx.fillStyle = boxFillStyle;
		Graphics.makeRoundedRectPath(ctx, 0, 0, width, cheight, 5);
		ctx.fill();
		
		var b = [];
		if (file.isCompleted) {
			b.push({
				s: 0, 
				w: width
			});
		} else if (file.isCanceled) {
			
		} else if (file.isStarted) {
			for (var c=file.firstChunk; c != -1; c = file.chunks[c].next) {
				var w = Math.ceil(file.chunks[c].chunkSize / file.totalSize * width);
				b.push({
					s: Math.ceil(file.chunks[c].start / file.totalSize * width), 
					w: w
				});
			}
		}

		ctx.save();
		ctx.clip();

		var passes = [
			{ x:3, f: Graphics.createInnerShadowGradient(ctx, cheight, "#AFA259", "#E8D675", "#F2E17E", "#F5F1B8") },
			{ x:2, f: Graphics.createInnerShadowGradient(ctx, cheight, "#9A8F4E", "#B0A359", "#B3A75D", "#BAB78B") },
			{ x:1, f: Graphics.createInnerShadowGradient(ctx, cheight, "#8E8746", "#B0A359", "#8E8746", "#CACB96") },
			{ x:0, f: chunkFillStyle, s:chunkFillStyle }
		];
		
	
		b.forEach(
			function(chunk) {
				passes.forEach(
					function(pass) {
						ctx.fillStyle = pass.f;
						Graphics.makeRoundedRectPath(ctx, chunk.s + pass.x + 0.5, 0, chunk.w, cheight, 3);
						ctx.fill();
						if (pass.s) {
							ctx.lineWidth = 2;
							ctx.strokeStyle = pass.s;
							ctx.stroke();
						}
					}
				)
			}
		);
		ctx.restore();
		
		// draw container chunks border
		Graphics.makeRoundedRectPath(ctx, 0, 0, width, cheight, 5);
		ctx.stroke();
	
		// draw progress back
		ctx.translate(0, cheight + 1);
		ctx.fillStyle = partialBoxFillStyle;
		Graphics.makeRoundedRectPath(ctx, 0, 0, width, 8, 3);
		ctx.fill();
	
		// draw progress
		ctx.fillStyle = partialFillStyle;
		Graphics.makeRoundedRectPath(ctx, 0, 0, Math.ceil(file.partialSize / file.totalSize * width), 8, 3);
		ctx.fill();
	
		// draw progress border
		Graphics.makeRoundedRectPath(ctx, 0, 0, width, 8, 3);
		ctx.stroke();
	
		ctx.restore();

		setTimeout("updateChunkCanvas()", Check.frequencyUpdateChunkGraphs);

	} catch(ex) {
		Debug.dump("updateChunkCanvas(): ", ex);
	}
}

function stopCanvas() {Prefs.currentTooltip=null;}


