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

var get_file = function(rel_path) {
	var path = location.href.replace("index.html", "") + rel_path;
	var testURI = Services.io.newURI(path, null, null);
	const ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);
	testURI = ChromeRegistry.convertChromeURL(testURI);

	return testURI.QueryInterface(Ci.nsIFileURL).file;
};
function strict_filter(a, b, prop, message) {
	if (!message) {
		message = "";
	}
	for (var i = 0; i < prop.length; i++) {
		var index = prop[i];
		deepEqual(a[index], b[index], message + index);
	}
}

function check_download(downloads, d, message) {
	if (!message) {
		message = "";
	}
	var download;
	for (var i = 0; i < downloads.length; i++) {
		if (downloads[i].fileName === d.fileName) {
			download = downloads[i];
			strict_filter(download, d, [
				"fileName", "copyright", "description",
				"identity", "lang", "license", "size",
				"mirrors", "numIstance", "publisher",
				"referrer", "sys", "version"
			], message);

			if (d.startDate) {
				strictEqual(download.startDate.toString(), d.startDate.toString(), message + "startDate");
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
	}
	if (!download) {
		equal(true, false, message + "download not found");
	}
}
function check_info(info, i, message) {
	strict_filter(info, i, [
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

	var file = get_file("data/metalink/testFile.metalink");

	parse(file, "", function(data, ex) {
		strictEqual(ex, undefined, "parsed correctly");
		equal(data.parser, "Metalinker Version 3.0", "correct parser verion");
		check_info(data.info, {
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

		check_download(data.downloads, {
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

		check_download(data.downloads, {
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
		start();
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
	var testsNum = 3;
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
	var file = get_file("data/metalink/errorFile.metalink");

	parse(file, "", function(data, ex) {
		strictEqual(ex.message, "LocalFile name not provided!", "file name error handle");
		cb();
	});

	file = get_file("data/metalink/emptyFile.metalink");
	parse(file, "", function(data, ex) {
		if (!ex) {
			equal(true, false, "no 'files' node in metalink");
		}
		cb();
	});

	file = get_file("data/metalink/blank.metalink");
	parse(file, "", function(data, ex) {
		if (!ex) {
			equal(true, false, "blank metalink file");
		}
		cb();
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

	var file = get_file("data/metalink/kernel.metalink");

	parse(file, "", function(data, ex) {
		strictEqual(ex, undefined, "parsed correctly");
		equal(data.parser, "Metalinker Version 3.0", "correct parser verion");
		check_info(data.info, {
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

		check_download(data.downloads, {
			copyright: "",
			description: "Linux kernel",
			fileName: "linux-2.6.16.19.tar.bz2",
			lang: "",
			identity: "",
			license: null,
			logo: null,
			mirrors: 8,
			numIstance: 63,
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
