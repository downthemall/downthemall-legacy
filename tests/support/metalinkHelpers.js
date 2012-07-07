"use strict";
var metalink_filterEqual = function(a, b, prop, message) {
	message = message || "";
	for (var i = 0; i < prop.length; i++) {
		var index = prop[i];
		deepEqual(a[index], b[index], message + index);
	}
}

var metalink_getDownload = function(downloads, fileName) {
	for (var i = 0; i < downloads.length; i++) {
		if (downloads[i].fileName === fileName) {
			return downloads[i];
		}
	}
}
var metalink_checkDownload = function(downloads, d, message) {
	message = message || "";

	var download = metalink_getDownload(downloads, d.fileName);
	if (!download) {
		ok(download, message + "download not found");
		return;
	}
	metalink_filterEqual(download, d, [
		"fileName", "copyright", "description",
		"identity", "lang", "license", "size",
		"mirrors", "publisher",
		"referrer", "sys", "version"
	], message);

	if (d.numIstance) {
		strictEqual(download.numIstance, d.numIstance, message + "DTA-num");
	}
	if (d.startDate) {
		strictEqual(download.startDate.toString(), d.startDate.toString(), message + "DTA-startDate");
	}

	var urls = download.url.toArray().map(function(e) {
		return e.toString();
	});
	arrayEqual(urls, d.urls, message + "urls");

	if (download.hashCollection) {
		strictEqual(download.hashCollection.full.sum.toLowerCase(), d.hash.full, message + "hash");
		strictEqual(download.hashCollection.full.type, d.hash.type, message + "hash type");
		if (download.hashCollection.partials.length) {
			strictEqual(download.hashCollection.parLength, d.hash.pieceLength, message + "piece length");
			strictEqual(download.hashCollection.partials[0].type, d.hash.pieceType, message + "piece type");
			var pieces = download.hashCollection.partials.map(function(e) {
				return e.sum;
			});
			arrayEqual(d.hash.pieces, pieces, message + "pieces");
		}
	}
	else {
		ok(!d.hash, message + "hash");
	}
}
var metalink_checkInfo = function(info, i, message) {
	metalink_filterEqual(info, i, [
		"identity", "description", "logo",
		"license", "publisher", "start"
	], message);
}
var metalink_asyncTestFile = function(files, cb) {
	if (typeof files === "string") {
		files = [files + ".metalink", files + ".meta4"];
	}
	const {parse} = require("support/metalinker");
	for (var i = 0; i < files.length; i++) {
		(function(f) {
			asyncTest(f, function() {
				parse(getRelURI(f), "", function(data, ex) {
					start();
					cb(data, ex);
				});
			});
		})(files[i]);
	}
}

var metalink_createUrlManager = function(urls) {
    const {UrlManager} = require("support/urlmanager");
	return new UrlManager(urls.map(function(e) {
		return Services.io.newURI(e, null, null);
	}));
}
var metalink_downloadCollection = function(downloads) {
	this.downloads = downloads.map(function(d) {
		var top_hash, hashCollection = null;
		if (d.hash) {
			top_hash = new DTA.Hash(d.hash.full, d.hash.type);
			hashCollection = new DTA.HashCollection(top_hash);

			if (d.hash.pieces) {
				hashCollection.parLength = d.hash.pieceLength;
				for (var i in Iterator(d.hash.pieces)) {
					hashCollection.add(new DTA.Hash(i[1], d.hash.pieceType));
				}
			}
		}
		return {
			fileName: d.fileName,
			startDate: d.startDate ? d.startDate : new Date(),
			referrer: d.referrer? Services.io.newURI(d.referrer, null, null): null,
			description: d.description,
			urlManager: metalink_createUrlManager(d.urls),
			totalSize: d.size,
			bNum: d.numIstance,
			hashCollection: hashCollection
		};
	});
}
var metalink_downloadIterator = function(collection) {
	this.downloadCollection = collection;
	this.index = 0;
}
metalink_downloadIterator.prototype.next = function() {
	if (this.index >= this.downloadCollection.downloads.length) {
		this.index = 0;
		throw StopIteration;
	}
	else {
		return this.downloadCollection.downloads[this.index++];
	}
}

metalink_downloadCollection.prototype.__iterator__ = function() {
	return new metalink_downloadIterator(this);
}

function metalink_getExportedResults(downloads, cb) {
	const {exportToMetalink4File} = require("manager/imex");
	const Prefs = require("preferences");
	const {parse} = require("support/metalinker");
	var file = Services.dirsvc.get("TmpD", Ci.nsIFile);
	file.append("tmp.meta4");
	var fileURI = Services.io.newFileURI(file).spec;

	var coll = new metalink_downloadCollection(downloads);
	exportToMetalink4File(coll, document, file, Prefs.permissions);
	parse(fileURI, "", function(data, ex) {
		cb(data, ex);
	});
}