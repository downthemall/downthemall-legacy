/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const BUFFER_SIZE = 5 * 1024 * 1024;
const FREQ = 250;

const DTA = require("api");
const {setInterval, clearInterval} = require("support/defer");
const Prefs = require("preferences");

class Decompressor {
	constructor(download, callback) {
		this.download = download;
		this.callback = callback;
		this.to = download.destinationLocalFile.clone();
		this.from = download.tmpFile.clone();
		this.exception = null;

		try {
			this._outStream = new Instances.FileOutputStream(this.to, 0x04 | 0x08, Prefs.getExt('permissions', 384), 0);
			this.outStream = new Instances.BinaryOutputStream(
				new Instances.BufferedOutputStream(this._outStream, BUFFER_SIZE));

			const converter = Cc["@mozilla.org/streamconv;1?from=" + download.compression + "&to=uncompressed"]
				.createInstance(Ci.nsIStreamConverter);

			converter.asyncConvertData(
				download.compression,
				"uncompressed",
				this,
				null
			);

			const chan = Services.oldio.newChannelFromURI(Services.io.newFileURI(this.from));
			chan.asyncOpen(converter, null);
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

	setException(ex) {
		if (this.exception) {
			return;
		}
		this.exception = ex;
	}

	close() {
		try {
			this.outStream.flush();
			this._outStream.QueryInterface(Ci.nsISeekableStream).setEOF();
		}
		catch (ex) {
			this.setException(ex);
		}
		finally {
			try {
				this.outStream.close();
				this._outStream.close();
			}
			catch (ex) {
				// huh?
				log(LOG_ERROR, "Decompressor: close streams", ex);
			}
		}
	}

	QueryInterface(iid) {
		if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsIStreamListener) || iid.equals(Ci.nsIRequestObserver)) {
			return this;
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	}
	onStartRequest(r, c) {
		this._timer = setInterval(() => this.download.invalidate(), FREQ);
	}
	onStopRequest(request, c) {
		clearInterval(this._timer);
		// important, or else we don't write out the last buffer and truncate too early. :p
		try {
			this.close();
			if (this.exception) {
				try {
					this.to.remove(false);
				}
				catch (ex) {
					// no-op: we're already bad :p
				}
			}
			else {
				try {
					this.from.remove(false);
				}
				catch (ex) {
					log(LOG_ERROR, "Failed to remove tmpFile", ex);
				}
			}
		}
		catch (ex) {
			this.setException(ex);
		}
		this.callback.call(this.download, this.exception);
	}
	onDataAvailable(request, c, stream, offset, count) {
		try {
			const binStream = new Instances.BinaryInputStream(stream);
			if (count !== this.outStream.write(binStream.readBytes(count), count)) {
				throw new Exception("Failed to write!");
			}
			this.download.partialSize = offset;
		}
		catch (ex) {
			this.setException(ex);
			const reason = 0x804b0002; // NS_BINDING_ABORTED;
			request.cancel(reason);
		}
	}
}

exports.Decompressor = Decompressor;
