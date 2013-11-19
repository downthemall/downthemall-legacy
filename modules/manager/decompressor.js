/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const BUFFER_SIZE = 5 * 1024 * 1024;
const FREQ = 250;

const DTA = require("api");
const {TimerManager} = require("support/timers");
const Prefs = require("preferences");

const Timers = new TimerManager();

function Decompressor(download, callback) {
	this.download = download;
	this.callback = callback;
	this.to = download.destinationLocalFile.clone();
	this.from = download.tmpFile.clone();

	try {
		this._outStream = new Instances.FileOutputStream(this.to, 0x04 | 0x08, Prefs.getExt('permissions', 384), 0);
		this.outStream = new Instances.BinaryOutputStream(
			new Instances.BufferedOutputStream(this._outStream, BUFFER_SIZE));

		let converter = Cc["@mozilla.org/streamconv;1?from=" + download.compression + "&to=uncompressed"]
			.createInstance(Ci.nsIStreamConverter);

		converter.asyncConvertData(
			download.compression,
			"uncompressed",
			this,
			null
		);

		Services.io.newChannelFromURI(Services.io.newFileURI(this.from)).asyncOpen(converter, null);
	}
	catch (ex) {
		try {
			if (this.outStream) {
				this.outStream.close();
			}
			if (this.to.exists()) {
				this.to.remove(false);
			}
			if (this.from.exists()) {
				this.from.remove(false);
			}
		}
		catch (exx) {
			// XXX: what now?
		}
		log(LOG_ERROR, "err. :p", ex);
		callback.call(download, ex);
	}
}
Decompressor.prototype = {
	exception: null,
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsIStreamListener) || iid.equals(Ci.nsIRequestObserver)) {
			return this;
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	},
	onStartRequest: function(r, c) {
		this._timer = Timers.createRepeating(FREQ, this.download.invalidate, this.download);
	},
	onStopRequest: function(request, c) {
		Timers.killTimer(this._timer);
		// important, or else we don't write out the last buffer and truncate too early. :p
		this.outStream.flush();
		try {
			this._outStream.QueryInterface(Ci.nsISeekableStream).setEOF();
		}
		catch (ex) {
			this.exception = ex;
		}
		try {
			this.outStream.close();
			this._outStream.close();
		}
		catch (ex) {
			// huh?
			log(LOG_ERROR, "Decompressor: close streams", ex);
		}
		if (this.exception) {
			try {
				this.to.remove(false);
			}
			catch (ex) {
				// no-op: we're already bad :p
			}
		}
		try {
			this.from.remove(false);
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to remove tmpFile", ex);
		}
		this.callback.call(this.download, this.exception);
	},
	onDataAvailable: function(request, c, stream, offset, count) {
		try {
			var binStream = new Instances.BinaryInputStream(stream);
			if (count !== this.outStream.write(binStream.readBytes(count), count)) {
				throw new Exception("Failed to write!");
			}
			this.download.partialSize = offset;
		}
		catch (ex) {
			this.exception = ex;
			var reason = 0x804b0002; // NS_BINDING_ABORTED;
			request.cancel(reason);
		}
	}
};

exports.Decompressor = Decompressor;
