"use strict";
/* global module, test, asyncTest, checkExports, createTestHttpChannel, strictEqual, arrayEqual */
/* global ok, getRelURI, start */
module("manager/connection.js");

test("exports", function() {
	checkExports("manager/connection", ["Connection"]);
});

(function() {
	var {Connection} = require("manager/connection");
	const {VisitorManager} = require("manager/visitormanager");
	const {UrlManager} = require("support/urlmanager");
	const DTA = require("api");
	const request = {
		"User-Agent": "Mozilla/5.0 (Windows NT 6.2; WOW64; rv:16.0) Gecko/16.0 Firefox/16.0",
		"Referer": "http://example.com",
		"Host": "www.example.com",
		"Connection": "keep-alive",
		"Accept-Language": "en-US,en;q=0.5",
		"Accept-Encoding": "gzip, deflate",
		"Accept": "text/html,application/xhtml+xml,application/xml,application/metalink," +
			"application/metalink4+xml;q=0.9,*/*;q=0.8",
		"Want-Digest": DTA.WANT_DIGEST_STRING
	};
	const range = function(num) {
		var arr = new Array(num);
		for (var i = 1; i <= num; i++) {
			arr[i - 1] = i;
		}
		return arr;
	};
	const extractMetaInfo = function(download, channel, cb, visitor) {
		if (visitor) {
			download.isMetalink = visitor.isMetalink;
			download.fromMetalink = visitor.fromMetalink;
			download.fileName = visitor.fileName;
			download.totalSize = visitor.contentLength > 0 ? visitor.contentLength : 0;
			if (!download.hashCollection && visitor.hash) {
				download.hashCollection = new DTA.HashCollection(visitor.hash);
			}
		}
		if (!download.urlManager) {
			download.urlManager = new UrlManager([channel.URI]);
		}
		Connection.prototype.extractMetaInfo.apply({
			d: download,
			c: { running: false },
			_chan: channel
		}, arguments);
	};
	const getTestDownload = function() {
		return {
			referrer: Services.io.newURI("http://www.example.com", null, null),
			visitors: new VisitorManager(),
			isMetalink: false,
			fromMetalink: false,
			fileName: "example",
			hashCollection: null,
			urlManager: null
		};
	};

	test("metalink duplicates real world", function() {
		var download = getTestDownload();
		var uri = Services.io.newURI("http://example.com/file", null, null);
		var hash = new DTA.Hash("2413fb3709b05939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892", "sha256");
		download.hashCollection = new DTA.HashCollection(hash);

		var chan = createTestHttpChannel({
			uri: uri,
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Digest": "SHA-256=" + btoa(hash.sum),
				"Link": "<http://example.com/mirror1>; rel=duplicate; pri=1; geo=de" +
				",<http://example.com/mirror2>; rel=duplicate; pri=2; geo=us" +
				",<http://example.com/mirror3>; rel=duplicate; pri=3; geo=pk" +
				",<http://example.com/mirror4>; rel=duplicate; pri=4; geo=ve" +
				",<http://example.com/mirror5>; rel=duplicate; pri=5; geo=vi" +
				",<http://example.com/mirror6>; rel=duplicate" +
				",<http://example.com/mirror7>; rel=duplicate"
			}
		});

		extractMetaInfo(download, chan);

		var expMirrors = range(7).map(function(i) {
			return "http://example.com/mirror" + i;
		});
		expMirrors.unshift(uri.spec);

		download.urlManager
			.toArray().sort(function(a, b) {
				return b.preference - a.preference;
			})
			.forEach(function(u, i) {
				strictEqual(u.url.spec, expMirrors[i], "mirror with correct preference merged");
			});
		strictEqual(download.hashCollection.full.sum, hash.sum, "correct hash merged");
		strictEqual(download.hashCollection.full.type, hash.type, "correct hash type merged");
	});

	test("metalink duplicates insecure hash", function() {
		var download = getTestDownload();
		var uri = Services.io.newURI("http://example.com/file", null, null);
		var hash = new DTA.Hash("cccd7f891ff81b30b9152479d2efcda2", "md5");
		download.hashCollection = new DTA.HashCollection(hash);
		download.hashCollection.parLength = 262144;
		download.partials = range(8).map(() => hash);

		var chan = createTestHttpChannel({
			uri: uri,
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Digest": hash.type.toUpperCase() + "=" + btoa(hash.sum),
				"Link": "<http://example.com/mirror1>; rel=duplicate; pri=1; geo=de" +
					",<http://example.com/mirror2>; rel=duplicate; pri=2; geo=us"
			}
		});

		extractMetaInfo(download, chan);

		arrayEqual(download.urlManager.toArray().map(u => u.url.spec),
				[uri.spec], "duplicates rejected due to insecure hash");
	});
	asyncTest("metalink describedby real world", function() {
		var download = getTestDownload();
		var uri = Services.io.newURI(
			"http://ftp.ad.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2", null, null);
		var hash = new DTA.Hash("2413fb3709b05939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892", "sha256");
		download.urlManager = new UrlManager([uri]);

		var chan = createTestHttpChannel({
			uri: uri,
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "40836905",
				"Digest": "SHA-256=" + btoa(hash.sum)
			}
		});

		var visitor = (new VisitorManager()).visit(chan);
		visitor.fileName = "linux-2.6.16.19.tar.bz2";
		visitor.metaDescribedBy = getRelURI("data/metalink/kernel.meta4");


		extractMetaInfo(download, chan, function(ex) {
			start();
			if (ex) {
				ok(false, ex);
				return;
			}
			var expMirrors = [
				"http://ftp.ad.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.ag.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.al.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.am.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.aq.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.ar.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.at.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2",
				"http://ftp.roedu.net/mirrors/ftp.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2"
			];
			strictEqual(download.fileName, "linux-2.6.16.19.tar.bz2", "file name merged correctly");
			strictEqual(download.hashCollection.full.sum,
				"2413fb3709b05939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892",
				"higher hash value not overwritten");
			strictEqual(download.hashCollection.full.type.toLowerCase(), "sha256",
									"higher hash type not overwritten");
			arrayEqual(expMirrors, download.urlManager.toArray().map(u => u.url.spec), "correct mirrors merged");
		}, visitor);
	});
	asyncTest("metalink describedby hash merging", function() {
		var download = getTestDownload();
		var uri = Services.io.newURI("http://example.com/sha512_hash", null, null);
		var expHash = new DTA.Hash(
			"cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2" +
			"b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
			"sha512");
		var hash = new DTA.Hash("2413fb3789b05939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892", "sha256");
		download.urlManager = new UrlManager([uri]);

		var chan = createTestHttpChannel({
			uri: uri,
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "2014232",
				"Digest": "SHA-256=" + btoa(hash.sum)
			}
		});

		var visitor = (new VisitorManager()).visit(chan);
		visitor.metaDescribedBy = getRelURI("data/metalink/hash.meta4");


		extractMetaInfo(download, chan, function(ex) {
			start();
			if (ex) {
				ok(false, ex);
				return;
			}
			strictEqual(download.fileName, "sha512_hash", "correct metalink file merged");
			strictEqual(download.hashCollection.full.type, hash.type, "full hash type merged correctly");
			strictEqual(download.hashCollection.full.sum, hash.sum, "full hash value merged correctly");
			arrayEqual(download.hashCollection.partials.map(p => p.sum), range(8).map(i => expHash.sum),
								 "partial hash value merged correctly");
			arrayEqual(download.hashCollection.partials.map(p => p.type), range(8).map(i => expHash.type),
								 "partial hash type merged correctly");
		}, visitor);
	});
	asyncTest("metalink describedby unsafe protocol switching without a safe hash", function() {
		var download = getTestDownload();
		var uri = Services.io.newURI("https://example.com/file1", null, null);
		var hash = new DTA.Hash("cccd7f891ff81b30b9152479d2efcda2", "md5");
		download.urlManager = new UrlManager([uri]);

		var chan = createTestHttpChannel({
			uri: uri,
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Link": '<http://example.meta4>; rel=describedby; type="application/metalink4+xml"',
				"Digest": hash.type.toUpperCase() + "=" + btoa(hash.sum)
			}
		});

		var visitor = (new VisitorManager()).visit(chan);

		extractMetaInfo(download, chan, function(ex) {
			start();
			strictEqual(ex, "unsafe transfer", "reject metalink due to unsafe transfer under lack of secure hash");
		}, visitor);
	});
	asyncTest("metalink describedby host switching without a safe hash", function() {
		var download = getTestDownload();
		var uri = Services.io.newURI("https://example.com/file1", null, null);
		var hash = new DTA.Hash("cccd7f891ff81b30b9152479d2efcda2", "md5");
		download.urlManager = new UrlManager([uri]);

		var chan = createTestHttpChannel({
			uri: uri,
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Link": '<https://hackmypc.meta4>; rel=describedby; type="application/metalink4+xml"',
				"Digest": hash.type.toUpperCase() + "=" + btoa(hash.sum)
			}
		});

		var visitor = (new VisitorManager()).visit(chan);

		extractMetaInfo(download, chan, function(ex) {
			start();
			strictEqual(ex, "host mismatch", "reject metalink due to host transfer under lack of secure hash");
		}, visitor);
	});
	asyncTest("ambiguous metalink describedby", function() {
		var download = getTestDownload();
		var uri = Services.io.newURI("http://example.com/file", null, null);
		var hash = new DTA.Hash("2413fb3709b05939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892", "sha256");
		download.urlManager = new UrlManager([uri]);

		var chan = createTestHttpChannel({
			uri: uri,
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Digest": "SHA-256=" + btoa(hash.sum)
			}
		});

		var visitor = (new VisitorManager()).visit(chan);
		visitor.fileName = "file";
		visitor.metaDescribedBy = getRelURI("data/metalink/testFile.meta4");


		extractMetaInfo(download, chan, function(ex) {
			start();
			strictEqual(ex, "metalink empty", "reject metalink with many files but no match");
		}, visitor);
	});
	asyncTest("metalink describedby with conflicting size", function() {
		var download = getTestDownload();
		var uri = Services.io.newURI(
			"http://ftp.ad.kernel.org/pub/linux/kernel/v2.6/linux-2.6.16.19.tar.bz2", null, null);
		var hash = new DTA.Hash("2413fb3709b05939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892", "sha256");
		download.urlManager = new UrlManager([uri]);

		var chan = createTestHttpChannel({
			uri: uri,
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Digest": "SHA-256=" + btoa(hash.sum)
			}
		});

		var visitor = (new VisitorManager()).visit(chan);
		visitor.metaDescribedBy = getRelURI("data/metalink/kernel.meta4");


		extractMetaInfo(download, chan, function(ex) {
			start();
			strictEqual(ex, "size mismatch", "reject metalink due to size mismatch with originating download");
		}, visitor);
	});
	asyncTest("metalink describedby with conflicting hash", function() {
		var download = getTestDownload();
		var uri = Services.io.newURI("http://example.com/sha256_hash", null, null);
		var hash = new DTA.Hash("3413fb3709b05939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892", "sha256");
		download.urlManager = new UrlManager([uri]);

		var chan = createTestHttpChannel({
			uri: uri,
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "2014232",
				"Digest": "SHA-256=" + btoa(hash.sum)
			}
		});

		var visitor = (new VisitorManager()).visit(chan);
		visitor.metaDescribedBy = getRelURI("data/metalink/hash.meta4");


		extractMetaInfo(download, chan, function(ex) {
			start();
			strictEqual(ex, "hash mismatch", "reject metalink due to hash mismatch with originating download");
		}, visitor);
	});
})();

