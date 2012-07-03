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
				parse(getFile(f), "", function(data, ex) {
					start();
					cb(data, ex);
				});
			});
		})(files[i]);
	}
}
