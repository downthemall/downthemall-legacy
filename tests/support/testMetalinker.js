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
	}
}
function metalink_checkDownload(downloads, d, message) {
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
	else {
		ok(!d.hash, message + "hash");
	}
}
function metalink_checkInfo(info, i, message) {
	metalink_filterEqual(info, i, [
		"identity", "description", "logo",
		"license", "publisher", "start"
	], message);
}
function metalink_asyncTestFile(files, cb) {
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

metalink_asyncTestFile(
	"data/metalink/testFile",
	function(data, ex) {
		strictEqual(ex, undefined, "parsed correctly");
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
	}
);

metalink_asyncTestFile(
	"data/metalink/utf",
	function(data, ex) {
		ok(!ex, "no errors in parser");
		console.log("data", data.downloads.map(function(e) e.fileName).join(""));
		metalink_checkDownload(data.downloads, {
			fileName: "Fußball läuft gerade",
			size: 2014232,
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
		}, "UTF-8 encoding:");
	}
);

metalink_asyncTestFile(
	"data/metalink/iso_encoding",
	function(data, ex) {
		ok(!ex, "no errors in parser");
		console.log("data", data.downloads.map(function(e) e.fileName).join(""));
		metalink_checkDownload(data.downloads, {
			fileName: "Fußball läuft gerade",
			size: 2014232,
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
	}
);

metalink_asyncTestFile(
	"data/metalink/windows_1252",
	function(data, ex) {
		ok(!ex, "no errors in parser");
		metalink_checkDownload(data.downloads, {
			fileName: "Fußball läuft gerade",
			size: 2014232,
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
	}
);

metalink_asyncTestFile(
	"data/metalink/kernel",
	function(data, ex) {
		if (ex) {
			throw ex;
		}
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
	}
);

metalink_asyncTestFile(
	"data/metalink/emptyFilesNode",
	function(data, ex) {
		strictEqual(ex.message, "No valid file nodes", "file name error handle");
	}
);

metalink_asyncTestFile(
	"data/metalink/emptyUrls",
	function(data, ex) {
		window.tmp = data;
		window.ex = ex;
		if (ex) {
			strictEqual(ex.message, "No valid files to process", "unsupported urls error handle");
		}
		else {
			ok(false, "unsupported urls error handle");
		}
	}
);

metalink_asyncTestFile(
	"data/metalink/emptyFile",
	function(data, ex) {
		ok(ex, "empty Metalink node");
	}
);

metalink_asyncTestFile(
	"data/metalink/emptyDownloadFile",
	 function(data, ex) {
		ok(ex, "no active file to download in the metalink");
	}
);

metalink_asyncTestFile(
	"data/metalink/blank",
	function(data, ex) {
		ok(ex, "blank metalink file");
	}
);

metalink_asyncTestFile(
	"data/metalink/invalid_metalink",
	function(data, ex) {
		ok(ex, "invalid metalink xml");
	}
);

metalink_asyncTestFile(
	"data/metalink/invalid_namespace",
	function(data, ex) {
		ok(ex, "invalid metalink namespace");
	}
);

metalink_asyncTestFile(
	["data/metalink/invalid_version.metalink"],
	function(data, ex) {
		ok(ex, "unsupported metalink version");
	}
);

metalink_asyncTestFile(
	"data/metalink/invalid_encoding",
	function(data, ex) {
		ok(ex, "invalid encoding fails to parse");
	}
);

metalink_asyncTestFile(
	"data/metalink/corrupt_hash",
	function(data, ex) {
		var download = metalink_getDownload(data.downloads, "corrupt_hash");
		ok(!download.hashCollection, "Corrupt hashes not used");

		download = metalink_getDownload(data.downloads, "corrupt_pieces");
		ok(!download.hashCollection.partials.length, "Corrupt pieces not used");
		strictEqual(download.hashCollection.full.sum.toLowerCase(),
			"ce50319f58e846e3e0c66a9ada9015e601126864", "Correct full hash");
	}
);

metalink_asyncTestFile(
	"data/metalink/priority_hash",
	function(data, ex) {
		var download = metalink_getDownload(data.downloads, "hash_priority");
		equal(download.hashCollection.full.type.toLowerCase(), "sha512", "hashes with higher priority used");
	}
);

metalink_asyncTestFile(
	"data/metalink/invalid_pieces",
	function(data, ex) {
		var download = metalink_getDownload(data.downloads, "unsupported_pieces");
		var exp_hash = "cccd7f891ff81b30b9152479d2efcda2";

		ok(!download.hashCollection.partials.length,  "Unsupported hash pieces not used");
		strictEqual(download.hashCollection.full.sum.toLowerCase(), exp_hash, "Correct full hash");

		download = metalink_getDownload(data.downloads, "invalid_piece_num");
		window.tmp = download;
		ok(!download.hashCollection.partials.length, "Out of range piece numbers");
		strictEqual(download.hashCollection.full.sum.toLowerCase(), exp_hash, "Correct full hash");

		download = metalink_getDownload(data.downloads, "few_pieces");
		ok(!download.hashCollection.partials.length, "Few partials given");
		strictEqual(download.hashCollection.full.sum.toLowerCase(), exp_hash, "Correct full hash");

		download = metalink_getDownload(data.downloads, "outnumbered_pieces");
		ok(!download.hashCollection.partials.length, "More partial hashes than the actual size");
		strictEqual(download.hashCollection.full.sum.toLowerCase(), exp_hash, "Correct full hash");
	}
);


metalink_asyncTestFile(
	"data/metalink/hash",
	function(data, ex) {
		start();
		if (ex) {
			throw ex;
		}
		var downloads = data.downloads;
		var hashes =	[
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
				val: false
			},
			{
				type: "rmd160",
				val: false
			},
			{
				type: "tiger",
				val: false
			},
			{
				type: "crc32",
				val: false
			}
		];
		var download;
		for each(var hash in hashes) {
			download = metalink_getDownload(downloads, hash.type + "_hash");
			equal(!!download.hashCollection, !!hash.val, "hash " + hash.type + (!hash.val ? " not" : "") + " parsed");
			if (download.hashCollection) {
				strictEqual(download.hashCollection.full.sum.toLowerCase(), hash.val, hash.type + ": correct value");
				strictEqual(download.hashCollection.full.type.toLowerCase(), hash.type, hash.type + ": correct type");
				if (hash.val) {
					strictEqual(download.hashCollection.parLength, 262144, hash.type + ": piece length");
					strictEqual(download.hashCollection.partials[0].type.toLowerCase(), hash.type, hash.type + ": piece type");
					var pieces = download.hashCollection.partials.map(function(e) {
						return e.sum;
					});

					var exp_pieces = [];
					for (var i = 0; i < 8; i++) {
						exp_pieces.push(hash.val);
					}
					arrayEqual(exp_pieces, pieces, hash.type + ": pieces");
				}
			}
		}
	});
