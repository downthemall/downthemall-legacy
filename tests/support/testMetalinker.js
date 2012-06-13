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
			strictEqual(download.startDate.toString(), d.startDate.toString(), message + "startDate");
			var urls = download.url.toArray().map(function(e) {
				return e.toString();
			});
			arrayEqual(urls, d.urls, "urls");

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
			size: 1000,
			version: "test_file1_version",
			startDate: new Date("June 13, 2012 18:10:17 GMT+0800"),
			urls: [
				"ftp://example.com/test_file1_url1",
				"ftp://example.com/test_file1_url2"
			],
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
			startDate: new Date("June 13, 2012 18:10:17 GMT+0800"),
			urls: [
				"http://example.com/test_file2_url1",
			],
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
