"use strict";
module("manager/imex.js")

test("exports", function() {
	checkExports("manager/imex", [
		"exportToTextFile",
		"exportToHtmlFile",
		"exportToMetalinkFile",
		"exportToMetalink4File",
		"parseTextFile"
	]);
});

function imex_checkMetalinkExport(downloads, cb) {
	metalink_getExportedResults(downloads, function(data, ex) {
		for (var d in Iterator(downloads)) {
			metalink_checkDownload(data.downloads, d[1]);
		}
		cb();
	});
}

asyncTest("real world test case", function() {
	imex_checkMetalinkExport([
	{
		copyright: "",
		numIstance: 1,
		description: "The Linux kernel",
		fileName: "linux-2.6.16.19.tar.bz2",
		lang: "",
		identity: "",
		license: null,
		logo: null,
		mirrors: 8,
		publisher: null,
		referrer: null,
		sys: "",
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
	},
	{
		fileName: "testFile",
		startDate: new Date(),
		referrer: "http://example.com/",
		size: 21040,
		description: "sample desc",
		urls: [
			"http://example.com/test1",
			"http://example.com/test2"
		],
		numIstance: 4,
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
		},
		copyright: "",
		identity: "",
		lang: "",
		license: null,
		mirrors: 2,
		publisher: null,
		sys: "",
		version: "",
	}], function(data, ex) {
		start();
	});
});


asyncTest("No partial hashes test case", function() {
	imex_checkMetalinkExport([{
		fileName: "testFile",
		startDate: new Date(),
		size: 21040,
		referrer: null,
		description: "sample desc",
		urls: [
			"http://example.com/test1",
			"http://example.com/test2"
		],
		numIstance: 4,
		hash: {
			full: "01586b2c0ec5d8e985138204404878f5ecbeef58",
			type: "SHA1"
		},
		copyright: "",
		identity: "",
		lang: "",
		license: null,
		mirrors: 2,
		publisher: null,
		sys: "",
		version: "",
	}], function(data, ex) {
		start();
	});
});


asyncTest("No hash test case", function() {
	imex_checkMetalinkExport([{
		fileName: "testFile",
		startDate: new Date(),
		size: 21040,
		description: "sample desc",
		urls: [
			"http://example.com/test1",
			"http://example.com/test2"
		],
		referrer: null,
		numIstance: 4,
		hash: null,
		copyright: "",
		identity: "",
		lang: "",
		license: null,
		mirrors: 2,
		publisher: null,
		sys: "",
		version: "",
	}], function(data, ex) {
		start();
	});
});
