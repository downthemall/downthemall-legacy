"use strict";
module("manager/renamer.js");

test("exports", function() {
	checkExports("manager/renamer", ["createRenamer"]);
});

(function() {
	const {UrlManager} = require("support/urlmanager");
	const {URL} = require("api");
	const {normalizeSlashes, getCURL} = require("support/stringfuncs");
	const {createRenamer} = require("manager/renamer");

	var item = {
		fileNameAndExtension: {name: "fname", extension: "fext"},
		referrerFileNameAndExtension: {name: "rname", extension: "rext"},
		description: "desc/desc",
		title: "title/title",
		urlManager: new UrlManager([Services.io.newURI("https://www.host.tld/path/to/fname.fext?fqs#fref", null, null)]),
		referrer: Services.io.newURI("https://ref.refhost.rtld/rpath/rto/rfile.rext?rqs#rref", null, null),
		referrerUrlManager: new UrlManager([Services.io.newURI("https://ref.refhost.rtld/rpath/rto/rfile.rext?rqs#rref", null, null)]),
		bNum: 1,
		iNum: 2,
		startDate: new Date(123456789),

		get maskURL() this.urlManager.usableURL,
		get maskURLPath() this.urlManager.usableURLPath,
		get maskCURL() getCURL(this.maskURL),
		get maskReferrerURL() this.referrerUrlManager.usableURL,
		get maskReferrerURLPath() this.referrerUrlManager.usableURLPath,
		get maskReferrerCURL() getCURL(this.maskReferrerURL),

		noop: 0
	};

	var run_multiple = function(item, tests) {
		const rename = createRenamer(item);
		for (var i of ["first run ", "second run"]) {
			for (var [mask, res] in Iterator(tests)) {
				res = normalizeSlashes(res);
				strictEqual(normalizeSlashes(rename(mask)), res, i + mask + " = " + res);
			}
		}
	};

	test("name/ext", function() {
		run_multiple(Object.create(item), {
			"*name*": "fname",
			"*ext*": "fext",
			"*name*.ext": "fname.ext",
			"name.*ext*": "name.fext",
			"*name.*ext*": "*name.fext",
			"*name*.ext*": "fname.ext*"
		});
	});

	test("text/title", function() {
		run_multiple(Object.create(item), {
			"*text*": "desc desc",
			"*flattext*": "desc-desc",
			"*title*": "title/title",
			"*flattitle*": "title-title",
		});
	});

	test("url", function() {
		run_multiple(Object.create(item), {
			"*url*": "www.host.tld",
			"*domain*": "host.tld",
			"*subdirs*": "path/to",
			"*qstring*": "fqs",
			"*curl*": "www.host.tld/path/to/fname.fext",
			"*flatcurl*": "www.host.tld-path-to-fname.fext"
		});
	});

	test("url nopath", function() {
		var u = Object.create(item);
		u.urlManager = new UrlManager([Services.io.newURI("https://www.host.tld", null, null)]);
		run_multiple(u, {
			"*url*": "www.host.tld",
			"*domain*": "host.tld",
			"*subdirs*": "",
			"*qstring*": "",
			"*curl*": "www.host.tld",
			"*flatcurl*": "www.host.tld"
		});
	});

	test("ref", function() {
		var rename = createRenamer(Object.create(item));
		run_multiple(Object.create(item), {
			"*refer*": "ref.refhost.rtld",
			"*crefer*": "ref.refhost.rtld/rpath/rto/rfile.rext",
			"*flatcrefer*": "ref.refhost.rtld-rpath-rto-rfile.rext",
			"*referdirs*": "rpath/rto",
			"*flatreferdirs*": "rpath-rto",
			"*refername*.*referext*": "rname.rext",
			"*referqstring*": "rqs"
		});
	});

	test("noref", function() {
		const r = Object.create(item);
		r.referrer = null;
		r.referrerUrlManager = null;
		r.referrerFileNameAndExtension = null;

		run_multiple(r, {
			"*refer*": "",
			"*crefer*": "",
			"*flatcrefer*": "",
			"*referdirs*": "",
			"*flatreferdirs*": "",
			"*refername*.*referext*": "."
		});
	});

	test("num", function() {
		run_multiple(Object.create(item), {
			"*num*": "001",
			"*inum*": "002"
		});
	});

	test("num odd", function() {
		const n = Object.create(item);
		item.bNum = 10000;
		item.iNum = -10000;
		run_multiple(n, {
			"*num*": "10000",
			"*inum*": "-10000"
		});
	});

	test("date", function() {
		run_multiple(Object.create(item), {
			"*y*-*m*-*d*-*hh*-*mm*-*ss*": "1970-01-02-11-17-36"
		});
	});

})();
