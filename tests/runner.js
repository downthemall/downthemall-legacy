QUnit.config.autostart = false;
QUnit.extend(QUnit, {
	arrayEqual: function arrayEqual(actual, expected, message) {
		[actual, expected] = [actual.slice(0).sort(), expected.slice(0).sort()];
		QUnit.deepEqual(actual, expected, message);
	}
});
const arrayEqual = QUnit.arrayEqual;

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Exception = Components.Exception;

Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("chrome://dta-modules/content/glue.jsm");

const DTA = require("api");

function checkExports(m, exports) {
	arrayEqual(
		Object.keys(require(m)),
		exports,
		"Correct exports"
		);
}

function getRelURI(relPath) {
	var testURI = Services.io.newURI(location.href, null, null);
	testURI = Services.io.newURI(relPath, null, testURI);
	const ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);
	return ChromeRegistry.convertChromeURL(testURI);
}

(function() {
	if (Cc["@downthemall.net/testHttpChannel;1"]) {
		return;
	};
	var testHttpChannel = function() {
		this.wrappedJSObject = this;
		this.done = false;
		this.requestHeaders = {};
		this.responseHeaders = {};

		this.name = null;
		this.loadFlags = 0;
		this.loadGroup = null;
		this.status = 200;

		this.contentLength = -1;
		this.contentType = "text/html";
		this.contentCharset = "utf-8";
		this.URI = null;
		this.originalURI = null;
		this.owner = null;
		this.notificationCallbacks = null;
		this.securityInfo = null;

		this.redirectionLimit = 0,
		this.requestMethod =  "GET";
		this.requestSucceeded =  true;
		this.requestStatus =  true;
		this.responseStatus = 200;
		this.responseStatusText = "OK";

	}
	testHttpChannel.prototype = {
		initializeTestChannel: function(opts) {
			var requestHeaders = {}, responseHeaders = {};
			for (var req in Iterator(opts.request)) {
				requestHeaders[req[0].toLowerCase()] = req[1];
			}
			for (var res in Iterator(opts.response)) {
				responseHeaders[res[0].toLowerCase()] = res[1];
			}
			this.requestHeaders = requestHeaders;
			this.responseHeaders = responseHeaders;
			this.name = opts.uri;
			this.URI = opts.uri;
			this.originalURI = opts.uri;
		},

		QueryInterface: XPCOMUtils.generateQI([Ci.nsIHttpChannel]),
		classDescription: "test nsIHttpChannel",
		classID: Components.ID("{4b048560-c789-11e1-9b21-0800200c9a65}"),
		contractID: "@downthemall.net/testHttpChannel;1",

		isPending: function() {
			return !this.done;
		},
		cancel: function(status){
			this.status = status;
			this.done   = true;
		},
		suspend: function(status){
			this.status = status;
		},
		resume: function(status){
			this.status = status;
		},
		open: function() {
			throw Cr.NS_ERROR_NOT_IMPLEMENTED;
		},

		asyncOpen: function(listener, ctx) {
			this.listener = listener;
			this.context  = ctx;

			listener.onStartRequest(this, ctx);

			count++;
			var pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
			pipe.init(true,true,0,0,null);
			var result = 'test http channel result';
			pipe.outputStream.write(result,result.length);
			pipe.outputStream.close();

			listener.onDataAvailable(this, ctx, pipe.inputStream, 0, result.length);

			this.done = true;
			listener.onStopRequest(this, ctx, this.status);
		},
		setReferrer: function(uri, val) {},
		getRequestHeader: function(header) {
			var val = this.requestHeader[header.toLowerCase()];
			if (!val) {
				throw Cr.NS_ERROR_NOT_AVAILABLE;
			}
			return val;
		},
		getResponseHeader: function(header) {
			var val = this.responseHeaders[header.toLowerCase()];
			if (!val) {
				throw Cr.NS_ERROR_NOT_AVAILABLE;
			}
			return val;
		},
		isNoStoreResponse: function() false,
		setRequestHeader: function(header, value, merge) {
			this.responseHeaders[header.toLowerCase()] = value;
		},
		setResponseHeader: function(header, value, merge) {
			this.requestHeader[header.toLowerCase()] = value;
		},
		visitRequestHeaders: function(visitor) {
			for (var i in this.requestHeaders) {
				visitor.visitHeader(i, this.requestHeaders[i]);
			}
		},
		visitResponseHeaders: function(visitor) {
			for (var i in this.responseHeaders) {
				visitor.visitHeader(i, this.responseHeaders[i]);
			}
		},
	};
	const testHttpChannelFactory = {
		createInstance: function(outer, iid, p) {
			if (outer) {
				throw Cr.NS_ERROR_NO_AGGREGATION;
			}
			return new testHttpChannel();
		}
	};
	Components.manager
		.QueryInterface(Ci.nsIComponentRegistrar)
		.registerFactory(testHttpChannel.prototype.classID, testHttpChannel.prototype.classDescription, testHttpChannel.prototype.contractID, testHttpChannelFactory);
})();
var createTestHttpChannel = function(conf) {
	var chan = Cc["@downthemall.net/testHttpChannel;1"].createInstance(Ci.nsIHttpChannel);
	var chanObj = chan.wrappedJSObject;
	chanObj.initializeTestChannel(conf);
	return chan;
}
addEventListener("load", function load() {
	"use strict";
	removeEventListener("load", load, false);
	QUnit.start();
}, false);
