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
 * The Original Code is DownThemAll!
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
 
function Decompressor(download) {
	this.download = download;
	this.to = new FileFactory(download.destinationFile);
	this.from = download.tmpFile.clone();

	download.state = FINISHING;
	download.status =  _("decompress");
	try {

		this._outStream = new FileOutputStream(this.to, 0x04 | 0x08, 0766, 0);
		try {
			// we don't know the actual size, so best we can do is to seek to totalSize.
			var seekable = this._outStream.QueryInterface(Ci.nsISeekableStream);
			seekable.seek(0x00, download.totalSize);
			try {
				seekable.setEOF();
			}
			catch (exx) {
				// no-op
			}
			seekable.seek(0x00, 0);
		}
		catch (ex) {
			// no-op
		}
		var boutStream = new BufferedOutputStream(this._outStream, MAX_BUFFER_SIZE); 
		this.outStream = boutStream;
		boutStream = new BinaryOutputStream(this.outStream);
		this.outStream = boutStream;

		var converter = Cc["@mozilla.org/streamconv;1?from=" + download.compression + "&to=uncompressed"]
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
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	onStartRequest: function(r, c) {
		var thisp = this;		
		this._timer = new Timer(function() { thisp.download.invalidate(); }, STREAMS_FREQ, true);
	},
	onStopRequest: function(request, c) {
		this._timer.kill();
		// important, or else we don't write out the last buffer and truncate too early. :p
		this.outStream.flush();
		try {
			this._outStream.QueryInterface(Ci.nsISeekableStream).setEOF();
		}
		catch (ex) {
			this.exception = ex;
		}
		this._outStream.close();
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
				throw new Components.Exception("Failed to write!");
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