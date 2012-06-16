"use strict";
module("support/metalinker.js")

test("exports", function() {
	checkExports("support/metalinker", [
		"parse",
		"Metalink",
		"NS_DTA",
		"NS_HTML",
		"NS_METALINKER3",
		"NS_METALINK_RFC5854"
	]);
});


function metalink_filterEqual(a, b, prop, message) {
	message = message || "";
	for (var i = 0; i < prop.length; i++) {
		var index = prop[i];
		deepEqual(a[index], b[index], message + index);
	}
}

function metalink_getDownload(downloads, fileName) {
	for (var i = 0; i < downloads.length; i++) {
		if (downloads[i].fileName === fileName) {
			return downloads[i];
		}
		else {
			continue;
		}
	}
}
function metalink_checkDownload(downloads, d, message) {
	message = message || "";

	var download = metalink_getDownload(downloads, d.fileName);
	if (download) {
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
			strictEqual(download.startDate, d.startDate, message + "DTA-startDate");
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
		else if (d.hash) {
			equal(true, false, message + "hash");
		}
	}
	else {
		equal(true, false, message + "download not found");
	}
}
function metalink_checkInfo(info, i, message) {
	metalink_filterEqual(info, i, [
		"identity", "description", "logo",
		"license", "publisher", "start"
	], message);
}
asyncTest("metalink3_parser_general", function() {
	const {
		parse,
		Metalink,
		NS_DAT,
		NS_HTML,
		NS_METALINKER3,
		NS_METALINK_RFC5854
	} = require("support/metalinker");
	var testsNum = 2;
	var cb = function() {
		testsNum--;
		setTimeout(function() {
			if (testsNum > 0) {
				testsNum = -1;
				equal(true, false, "timeout error, parser callback not called");
				start();
			}
		}, 2000);
		if (testsNum === 0) {
			start();
		}
	};

	var file = getFile("data/metalink/testFile.metalink");

	parse(file, "", function(data, ex) {
		cb();
		strictEqual(ex, undefined, "parsed correctly");
		equal(data.parser, "Metalinker Version 3.0", "correct parser verion");
		metalink_checkInfo(data.info, {
			identity: "test_identity",
			description: "test_description",
			logo: null,
			license: [
				"test_license",
				"http://example.com/test_license"
			],
			publisher: [
				"test_publisher",
				"http://example.com/test_publisher"
			],
			start: false
		});

		metalink_checkDownload(data.downloads, {
			copyright: "test_file1_copyright",
			description: "test_description",
			fileName: "test_file1",
			lang: "en-US",
			identity: "test_file1_identity",
			license: [
				"test_file1_license",
				"http://example.com/test_file1_license"
			],
			logo: "http://example.com/test_file1_logo",
			mirrors: 2,
			numIstance: 1,
			publisher: [
				"test_file1_publisher",
				"http://example.com/test_file1_publisher"
			],
			referrer: "test_file1_referrer",
			sys: "test_file1_os",
			size: 2014232,
			version: "test_file1_version",
			urls: [
				"ftp://example.com/test_file1_url1",
				"ftp://example.com/test_file1_url2"
			],
			hash: {
				full: "01586b2c0ec5d8e985138204404878f5ecbeef58",
				type: "SHA1",
				pieceType: "SHA1",
				pieceLength: 262144,
				pieces: [
					"ce50319f58e846e3e0c66a9ada9015e601126864",
					"c9e73e336831a364cedcd889259b7330d48f90fd",
					"a7f5281c629ea63c791f320db3b0df85fdb01861",
					"e6cf5571185db0ec79b551222596462db445bdd6",
					"8982e850d2e3ea005119beea3cc05daca28de474",
					"a0e7a3a3a46f1ae5fb4eb8529b6fb8ee82fa43a8",
					"96540cfade1ce9d3846f41510fbed46965b29568",
					"87108128d4dde5ba62ffec1f1cc3fc292fc298ca"
				]
			}
		}, "Download (1):");

		metalink_checkDownload(data.downloads, {
			copyright: "test_file2_copyright",
			description: "test_description",
			fileName: "test_file2",
			lang: "zh-Hans",
			identity: "",
			license: [
				"test_file2_license",
				"http://example.com/test_file2_license"
			],
			logo: null,
			mirrors: 1,
			numIstance: 2,
			publisher: [
				"test_file2_publisher",
				"http://example.com/test_file2_publisher"
			],
			referrer: "test_file2_referrer",
			sys: "test_file2_os",
			size: 1000,
			version: "test_file2_version",
			urls: [
				"http://example.com/test_file2_url1",
			],
			hash: {
				full: "cccd7f891ff81b30b9152479d2efcda2",
				type: "MD5"
			}
		}, "Download (2):");
	});

	file = getFile("data/metalink/iso_encoding.metalink");
	parse(file, "", function(data, ex) {
		cb();
		ok(!ex, "no errors in parser");
		metalink_checkDownload(data.downloads, {
			fileName: "test",
			size: 2014232,
			hash: {
				full: "cccd7f891ff81b30b9152479d2efcda2",
			type: "MD5"
			},
			urls: [
				"http://example.com/encoding"
			],
			copyright: "",
			identity: "",
			description: "",
			lang: "",
			license: null,
			mirrors: 1,
			publisher: null,
			sys: "",
			version: "",
			referrer: null
		}, "ISO-8859-1 encoding:");
	});

	file = getFile("data/metalink/window_1252.metalink");
	parse(file, "", function(data, ex) {
		cb();
		ok(!ex, "no errors in parser");
		metalink_checkDownload(data.downloads, {
			fileName: "test",
			size: 2014232,
			hash: {
				full: "cccd7f891ff81b30b9152479d2efcda2",
			type: "MD5"
			},
			urls: [
				"http://example.com/encoding"
			],
			copyright: "",
			identity: "",
			description: "",
			lang: "",
			license: null,
			mirrors: 1,
			publisher: null,
			sys: "",
			version: "",
			referrer: null
		}, "Western window-1252 encoding:");
	});

});

asyncTest("metalink3_parser_errors", function() {
	const {
		parse,
		Metalink,
		NS_DAT,
		NS_HTML,
		NS_METALINKER3,
		NS_METALINK_RFC5854
	} = require("support/metalinker");
	var testsNum = 7;
	var cb = function() {
		testsNum--;
		setTimeout(function() {
			if (testsNum > 0) {
				testsNum = -1;
				equal(true, false, "timeout error, parser callback not called");
				start();
			}
		}, 2000);
		if (testsNum === 0) {
			start();
		}
	};
	var file = getFile("data/metalink/emptyFilesNode.metalink");

	parse(file, "", function(data, ex) {
		strictEqual(ex.message, "LocalFile name not provided!", "file name error handle");
		cb();
	});

	file = getFile("data/metalink/emptyFile.metalink");
	parse(file, "", function(data, ex) {
		ok(ex, "no 'files' node in metalink");
		cb();
	});

	file = getFile("data/metalink/emptyDownloadFile.metalink");
	parse(file, "", function(data, ex) {
		ok(ex, "no active file to download in metalink file");
		cb();
	});

	file = getFile("data/metalink/blank.metalink");
	parse(file, "", function(data, ex) {
		ok(ex, "blank metalink file");
		cb();
	});

	file = getFile("data/metalink/invalid_metalink.metalink");
	parse(file, "", function(data, ex) {
		ok(ex, "invalid metalink xml");
		cb();
	});

	file = getFile("data/metalink/invalid_namespace.metalink");
	parse(file, "", function(data, ex) {
		ok(ex, "invalid metalink namespace");
		cb();
	});

	file = getFile("data/metalink/invalid_encoding.metalink");
	parse(file, "", function(data, ex) {
		if (ex) {
			ok(true, "invalid encoding not supported");
		}
		else {
			// assuming that encoding is fixed then data should be parsed correctly
			metalink_checkDownload(data.downloads, {
				fileName: "test_êèé_æøå",
				size: 2014232,
				urls: [
					"http://example.com/invalid_encoding"
				],
				copyright: "",
				description: "",
				lang: "",
				license: null,
				mirrors: 1,
				identity: "",
				publisher: null,
				referrer: null,
				sys: "",
				version: ""
			}, "fixed invalid encoding: ");
		}
		cb();
	});


});
asyncTest("metalink3_hash", function() {
	const {
		parse,
		Metalink,
		NS_DAT,
		NS_HTML,
		NS_METALINKER3,
		NS_METALINK_RFC5854
	} = require("support/metalinker");

	var file = getFile("data/metalink/hash.metalink");

	parse(file, "", function(data, ex) {
		start();
		if (ex) {
			console.log(ex);
			ok(false, "Error parsing hash.metalink");
		}
		else {
			var downloads = data.downloads;
			var hashes =  [
				{
					type: "md5",
					val: "cccd7f891ff81b30b9152479d2efcda2"
				},
				{
					type: "sha1",
					val: "01586b2c0ec5d8e985138204404878f5ecbeef58"
				},
				{
					type: "sha256",
					val: "2413fb3709b05939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892"
				},
				{
					type: "sha384",
					val: "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b"
				},
				{
					type: "sha512",
					val: "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e"
				},
				{
					type: "md4",
					val: "31d6cfe0d16ae931b73c59d7e0c089c0"
				},
				{
					type: "rmd160",
					val: "9c1185a5c5e9fc54612808977ee8f548b2258d31"
				},
				{
					type: "tiger",
					val: "223c9a0e319c7401441afc717b80e50a6807f708c0443cab"
				},
				{
					type: "crc32",
					val: "519956fa"
				}
			];
			var hash, download;
			for (var i = 0; i < hashes.length; i++) {
				hash = hashes[i];
				download = metalink_getDownload(downloads, hash.type + "_hash");
				if (download.hashCollection) {
					strictEqual(download.hashCollection.full.sum.toLowerCase(), hash.val, hash.type + ": correct value");
					strictEqual(download.hashCollection.full.type.toLowerCase(), hash.type, hash.type + ": correct type");
				}
				else {
					ok(false, hash.type + " hashes not supported!");
				}
			}

			download = metalink_getDownload(downloads, "incorrect_hashes");
			ok(!download.hashCollection, "incorrect hashes not used");

			download = metalink_getDownload(downloads, "hash_priority");
			equal(download.hashCollection.full.type.toLowerCase(), "sha512", "hashes with higher priority used");
		}
	});
});

asyncTest("metalink3_parser_realworld", function() {
	const {
		parse,
		Metalink,
		NS_DAT,
		NS_HTML,
		NS_METALINKER3,
		NS_METALINK_RFC5854
	} = require("support/metalinker");

	var file = getFile("data/metalink/kernel.metalink");

	parse(file, "", function(data, ex) {
		strictEqual(ex, undefined, "parsed correctly");
		equal(data.parser, "Metalinker Version 3.0", "correct parser verion");
		metalink_checkInfo(data.info, {
			identity: "linux-2.6.16.19.tar.bz2",
			description: "Linux kernel",
			logo: null,
			license: [
				"GPL",
				"http://www.gnu.org/copyleft/gpl.html"
			],
			publisher: [
				"Package resources",
				"http://www.packages.ro/"
			],
			start: false
		});

		metalink_checkDownload(data.downloads, {
			copyright: "",
			description: "Linux kernel",
			fileName: "linux-2.6.16.19.tar.bz2",
			lang: "",
			identity: "",
			license: null,
			logo: null,
			mirrors: 8,
			publisher: null,
			referrer: null,
			sys: "Linux-x86",
			size: 40836905,
			version: "",
			urls: [
				"http://ftp.ad.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.ag.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.al.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.am.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.aq.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.ar.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.at.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.roedu.net/mirrors/ftp.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2"
			],

			hash: {
				full: "b1e3c65992b0049fdbee825eb2a856af",
				type: "MD5"
			}
		}, "Linux kernel:");
		start();
	});

});
