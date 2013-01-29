"use strict";
module("manager/visitormanager.js");

test("exports", function() {
	checkExports("manager/visitormanager", ["VisitorManager"]);
});

test("real world http visit", function() {
	const {VisitorManager} = require("manager/visitormanager");
	const {getTimestamp} = require("utils");

	const response = {
		"Etag": "686897696a7c876b7e",
		"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
		"Last-Modified": "Sat, 11 Aug 2012 08:58:33 GMT",
		"Expires": "-1",
		"Cache-Control": "private, max-age=0",
		"Content-Type": "text/html; charset=Big5",
		"Content-Encoding": "gzip",
		"Accept-Ranges": "bytes",
		"Content-Length": "1024",
		"Transfer-Encoding": "chunked"
	};
	const chan = createTestHttpChannel({
		uri: Services.io.newURI("http://www.example.com", null, null),
		request: {
			"User-Agent": "Mozilla/5.0 (Windows NT 6.2; WOW64; rv:16.0) Gecko/16.0 Firefox/16.0",
			"Referer": "http://example.com",
			"Host": "www.example.com",
			"Connection": "keep-alive",
			"Accept-Language": "en-US,en;q=0.5",
			"Accept-Encoding": "gzip, deflate",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
		},
		response: response
	});

	const visit = (new VisitorManager()).visit(chan);

	strictEqual(visit.type.toLowerCase(), response["Content-Type"].toLowerCase(), "content type");
	strictEqual(visit._charset.toLowerCase(), "big5", "charset");
	strictEqual(visit.encoding.toLowerCase(), "gzip", "encoding");
	strictEqual(visit.acceptRanges, true, "range request supported");
	strictEqual(visit.contentLength, 1024, "content length");

	strictEqual(visit['content-encoding'].toLowerCase(), "gzip", "content encoding");
	strictEqual(visit['etag'].toLowerCase(), response["Etag"], "etag");
	strictEqual(visit['last-modified'].toLowerCase(), response["Last-Modified"].toLowerCase(), "last modified");
	strictEqual(visit.time, getTimestamp(response["Last-Modified"].toLowerCase()), "time");
});
(function() {
	const DTA = require("api");
	const digestRequest = {
		"User-Agent": "Mozilla/5.0 (Windows NT 6.2; WOW64; rv:16.0) Gecko/16.0 Firefox/16.0",
		"Referer": "http://example.com",
		"Host": "www.example.com",
		"Connection": "keep-alive",
		"Accept-Language": "en-US,en;q=0.5",
		"Accept-Encoding": "gzip, deflate",
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Want-Digest": DTA.WANT_DIGEST_STRING
	};
	test("http digests visit", function() {
		const {VisitorManager} = require("manager/visitormanager");
		const {getTimestamp} = require("utils");

		const chan = createTestHttpChannel({
			uri: Services.io.newURI("http://www.example.com", null, null),
			request: digestRequest,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Digest": "SHA-1=" + btoa("01586b2c0ec5d8e985138204404878f5ecbeef58")
			}
		});

		const visit = (new VisitorManager()).visit(chan);

		strictEqual(visit.hash.sum, "01586b2c0ec5d8e985138204404878f5ecbeef58", "hash value");
		strictEqual(visit.hash.type.toLowerCase(), "sha1".toLowerCase(), "hash type");
	});

	test("http digests priority", function() {
		const {VisitorManager} = require("manager/visitormanager");
		const {getTimestamp} = require("utils");

		const chan = createTestHttpChannel({
			uri: Services.io.newURI("http://www.example.com", null, null),
			request: digestRequest,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Digest": "SHA-1=" + btoa("01586b2c0ec5d8e985138204404878f5ecbeef58") +
					",SHA-256=" + btoa("2413fb3709b05939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892") +
					",SHA-384=" + btoa("38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b") +
					",SHA-512=" + btoa("cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e")
			}
		});

		const visit = (new VisitorManager()).visit(chan);

		strictEqual(visit.hash.sum, "2413fb3709b05939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892", "high priority hash value");
		strictEqual(visit.hash.type.toLowerCase(), "sha256", "high priority hash type");
	});

	test("http digests corrupt", function() {
		const {VisitorManager} = require("manager/visitormanager");
		const {getTimestamp} = require("utils");

		var chan = createTestHttpChannel({
			uri: Services.io.newURI("http://www.example.com", null, null),
			request: digestRequest,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Digest": "SHA-1=" + btoa("01586bsdf2c0ec5d8e985138204404878f5ecbeef58") +
					",SHA-256=" + btoa("2413fb3709b0s5939f04cf2e92f7d0897fc2596f9ad0b8a9ea855c7bfebaae892") +
					",SHA-384=" + btoa("38b060a96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b") +
					",SHA-512=" + btoa("715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e")
			}
		});

		var visit = (new VisitorManager()).visit(chan);

		ok(!visit.hash, "corrupt hashes not parsed");
	});

	test("http digests unsupported hashes", function() {
		const {VisitorManager} = require("manager/visitormanager");
		const {getTimestamp} = require("utils");

		const chan = createTestHttpChannel({
			uri: Services.io.newURI("http://www.example.com", null, null),
			request: digestRequest,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Digest": "SHA=thvDyvhfIqlvFe+A9MYgxAfm1q5="
					+ ",unixsum=30637"
					+ ",md4=" + btoa("31d6cfe0d16ae931b73c59d7e0c089c0")
					+ ",rmd160=" + btoa("9c1185a5c5e9fc54612808977ee8f548b2258d31")
					+ ",tiger=" + btoa("9c1185a5c5e9fc54612808977ee8f548b2258d31")
			}
		});

		const visit = (new VisitorManager()).visit(chan);

		ok(!visit.hash, "unsupported hashes not parsed");
	});
})();

(function() {
	const request = {
		"User-Agent": "Mozilla/5.0 (Windows NT 6.2; WOW64; rv:16.0) Gecko/16.0 Firefox/16.0",
		"Referer": "http://example.com",
		"Host": "www.example.com",
		"Connection": "keep-alive",
		"Accept-Language": "en-US,en;q=0.5",
		"Accept-Encoding": "gzip, deflate",
		"Accept": "text/html,application/xhtml+xml,application/xml,application/metalink,application/metalink4+xml;q=0.9,*/*;q=0.8",
		"Want-Digest": DTA.WANT_DIGEST_STRING
	};
	test("http duplicate links visit", function() {
		const {VisitorManager} = require("manager/visitormanager");

		const chan = createTestHttpChannel({
			uri: Services.io.newURI("http://www.example.com", null, null),
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Link": "<http://example.com/mirror1>; rel=duplicate; pri=1; geo=de"
					+ ",<http://example.com/mirror2>; rel=duplicate; pri=2; geo=us"
					+ ",<http://example.com/mirror3>; rel=duplicate; pri=3; geo=pk"
					+ ",<http://example.com/mirror4>; rel=duplicate; pri=4; geo=ve"
					+ ",<http://example.com/mirror5>; rel=duplicate; pri=5; geo=vi"
					+ ",<http://example.com/mirror6>; rel=duplicate"
					+ ",<http://example.com/mirror7>; rel=duplicate"
			}
		});

		const visit = (new VisitorManager()).visit(chan);
		var expCount = 1;
		visit.mirrors.sort(function(a, b) {
			return b.preference - a.preference;
		}).forEach(function(mirror) {
			strictEqual(mirror.url.spec, "http://example.com/mirror" + expCount++, "duplicate link parsed with correct preference");
		});
	});

	test("http describeby metalink visit", function() {
		const {VisitorManager} = require("manager/visitormanager");

		const chan = createTestHttpChannel({
			uri: Services.io.newURI("http://www.example.com", null, null),
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Link": '<http://example.com/meta4>; rel=describedby; type="application/metalink4+xml"'
			}
		});

		const visit = (new VisitorManager()).visit(chan);
		strictEqual(visit.metaDescribedBy.spec, "http://example.com/meta4", "described by metalink link parsed correctly");
	});

	test("corrupt http link header", function() {
		const {VisitorManager} = require("manager/visitormanager");

		const chan = createTestHttpChannel({
			uri: Services.io.newURI("http://www.example.com", null, null),
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024",
				"Link": '<http://example.com/metalink>; rel=describedby; type="application/metalink"'
					+ ', <http://example.com/meta4>; rel=describeby; type="application/metalink4+xml"'
					+ ", <http://example.com/mirror1>"
					+ ", <http://example.com/mirror2>; rel=duplicated"
			}
		});
		const visit = (new VisitorManager()).visit(chan);
		strictEqual(visit.mirrors.length, 0, "corrupt duplicates not parsed");
		ok(!visit.metaDescribedBy, "corrupt describedby metalink link not parsed");
	});

	test("valid time", function() {
		const {VisitorManager} = require("manager/visitormanager");
		const chan = createTestHttpChannel({
			uri: Services.io.newURI("http://www.example.com", null, null),
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Last-Modified": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024"
			}
		});
		const vm = new VisitorManager();
		const visit = vm.visit(chan);
		strictEqual(vm.time, 1344675513000, "corrupt time parsed");
		strictEqual(visit.time, 1344675513000, "corrupt time parsed");
	});

	test("no time", function() {
		const {VisitorManager} = require("manager/visitormanager");
		const chan = createTestHttpChannel({
			uri: Services.io.newURI("http://www.example.com", null, null),
			request: request,
			response: {
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024"
			}
		});
		const vm = new VisitorManager();
		const visit = vm.visit(chan);
		throws(function() vm.time, /No Date registered/i, "No Date registered");
		ok(!visit.time, "No Date registered");
	});

	test("invalid time", function() {
		const {VisitorManager} = require("manager/visitormanager");
		const chan = createTestHttpChannel({
			uri: Services.io.newURI("http://www.example.com", null, null),
			request: request,
			response: {
				"Date": "Sat, 11 Aug 2012 08:58:33 GMT",
				"Last-Modified": "yesterday",
				"Content-Type": "text/html; charset=utf8",
				"Content-Length": "1024"
			}
		});
		const vm = new VisitorManager();
		const visit = vm.visit(chan);
		throws(function() vm.time, /No Date registered/i, "No Date registered");
		ok(!visit.time, "No Date registered");
	});

})();
