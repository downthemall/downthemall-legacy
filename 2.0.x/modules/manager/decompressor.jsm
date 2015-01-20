/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll! Decompressor module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *	 Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const EXPORTED_SYMBOLS = ['Decompressor'];


const BUFFER_SIZE = 5 * 1024 * 1024;
const FREQ = 250;

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Ctor = Components.Constructor;
const Exception = Components.Exception;

const DTA = {};
Cu.import("resource://dta/utils.jsm");
Cu.import("resource://dta/api.jsm", DTA);
Cu.import("resource://dta/support/timers.jsm");

const IOService = DTA.IOService;
const Prefs = DTA.Preferences;

const LocalFile = new Ctor('@mozilla.org/file/local;1', 'nsILocalFile', 'initWithPath');
const FileOutputStream = new Ctor('@mozilla.org/network/file-output-stream;1', 'nsIFileOutputStream', 'init');
const BinaryOutputStream = new Ctor('@mozilla.org/binaryoutputstream;1', 'nsIBinaryOutputStream', 'setOutputStream');
const BufferedOutputStream = new Ctor('@mozilla.org/network/buffered-output-stream;1', 'nsIBufferedOutputStream', 'init');
const BinaryInputStream = new Ctor('@mozilla.org/binaryinputstream;1', 'nsIBinaryInputStream', 'setInputStream');

const Timers = new TimerManager();

function Decompressor(download) {
	this.download = download;
	this.to = new LocalFile(download.destinationFile);
	this.from = download.tmpFile.clone();

	try {
		this._outStream = new FileOutputStream(this.to, 0x04 | 0x08, Prefs.getExt('permissions', 384), 0);
		this.outStream = new BinaryOutputStream(new BufferedOutputStream(this._outStream, BUFFER_SIZE));

		let converter = Cc["@mozilla.org/streamconv;1?from=" + download.compression + "&to=uncompressed"]
			.createInstance(Ci.nsIStreamConverter);

		converter.asyncConvertData(
			download.compression,
			"uncompressed",
			this,
			null
		);

		IOService.newChannelFromURI(IOService.newFileURI(this.from)).asyncOpen(converter, null);
	}
	catch (ex) {
		try {
			if (this.outStream) {
				outStream.close();
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
		Debug.log("err. :p", ex);
		download.complete(ex);
	}
}
Decompressor.prototype = {
	exception: null,
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsIStreamListener) || iid.equals(cI.nsIRequestObserver)) {
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
			Debug.log("Decompressor: close streams", ex);
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
			Debug.log("Failed to remove tmpFile", ex);
		}

		this.download.complete(this.exception);
	},
	onDataAvailable: function(request, c, stream, offset, count) {
		try {
			var binStream = new BinaryInputStream(stream);
			if (count != this.outStream.write(binStream.readBytes(count), count)) {
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