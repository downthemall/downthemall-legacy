joinListener.prototype = {

	stopRequest: null,
	imJoining: false,
	outStream: null,

	dump: function JL_dump(m, f) {
		if (typeof f == 'number') {
			try {
				f = this.d.chunks[f];
			} catch (ex) {}
		}
		if (typeof f == 'object' && 'fileManager' in f) {
			m += " [" + f.fileManager.leafName + "]";
		}
		Debug.dump('joinListener: ' + m);
	},

	next: function JL_next() {
		return this.d.chunks[this.current].next;
	},

	stopJoining: function JL_stopJoining(c) {
		if (this.stopRequest != null)
			this.stopRequest.cancel(0);
		this.closeStream();
	},

	init: function JL_init() {
		this.current = this.d.firstChunk;
		this.offset = this.d.chunks[this.d.firstChunk].chunkSize;
		this.fileManager = this.d.chunks[this.d.firstChunk].fileManager.clone();

		// open the stream in RW mode and seek to its end ;)
		// saves a lot of headaches :p
		var outStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
		outStream.init(this.fileManager, 0x04 | 0x08, 0766, 0);
		this.outStream = outStream.QueryInterface(Ci.nsISeekableStream);
		if (Preferences.getDTA("prealloc", true) && this.fileManager.fileSize != this.d.totalSize) {
			this.dump('trying to prealloc', this.d.firstChunk);
			this.outStream.seek(0x00, this.d.totalSize);
			this.outStream.setEOF();
		}

		this.outStream.seek(0x00, this.offset);

		// seek does not work correctly :p
		if (this.outStream.tell() != this.offset) {
			this.dump("tell mismatch" + this.offset + "/" + this.outStream.tell() + "/" + (this.offset - this.outStream.tell()));
			this.d.cancelDownload();
		}

		if (this.next() != -1)
			this.join(this.next());
	},

	join: function JL_join(c) {try {

		this.dump('join request', c);
		if (!this.outStream) {
			throw ("No outstream");
		}

		if (c != this.next() || this.d.chunks[c].isRunning || this.imJoining) return;
		if ((this.d.chunks[c].start - this.d.chunks[this.current].end) != 1) return;
		if (!this.d.chunks[c].fileManager.exists()) return;

		this.imJoining = this.d.chunks[this.current].isJoining = this.d.chunks[c].isJoining = true;
		var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

		var fileURI = ios.newFileURI(this.d.chunks[c].fileManager);
		var channel = ios.newChannelFromURI(fileURI); // create a channel from the downloaded chunk

		var listener = new dataCopyListener(this.outStream, this.d, c, this.offset, this);
		channel.asyncOpen(listener, null);

		this.dump('join started', c);
	} catch (e) {Debug.dump("join(): ", e);}
	},

	closeStream: function JL_closeStream() {
		if (this.outStream) {
			this.dump('closeStream', this.d.firstChunk);
			this.outStream.close();
			this.outStream = null;
		}
	},

	joinIsFinished: function JL_jobIsFinished(chunk) {
		this.imJoining = false;
		this.d.chunks[this.current].isJoining = this.d.chunks[chunk].isJoining = false;

		// are we canceled now?
		if (this.d.is(CANCELED)) {
			this.closeStream();

			Debug.dump("JoinIsFinished: Cancelling " + this.d.fileName);
			this.d.isPassed = true;
			this.d.cancelFamily();
			this.d.chunks = new Array();
			Check.checkClose();
			if (this.d.isRemoved) setRemoved(this.d);

			// return early
			return;
		}

		var p = this.d.chunks[this.current];
		var c = this.d.chunks[chunk];

		c.start = 0;
		c.fileManager = this.fileManager;
		c.chunkSize += p.chunkSize;
		c.previous = -1;
		p.chunkSize = 0;
		this.d.firstChunk = chunk;

		// put it in to debug a problem, which was: chunksize < filesize because incomplete chunks got saved due to a programming error
		var told = this.outStream.tell()
		if (this.offset != told) {
			this.dump("tell() mismatch: " + this.offset + "/" + this.outStream.tell() + "/" + (this.offset - this.outStream.tell()));
			if (this.offset < told) {
				this.outStream.seek(0x00, this.offset);
			} else {
				this.d.cancelDownload();
			}
		}

		if (!this.d.is(PAUSED) && Check.isClosing) {
			this.closeStream();
			Debug.dump("We're closing from Join... isPassed=true");
			this.d.isPassed = true;
			Check.checkClose();
		}
		// more to do
		else {
			this.current = chunk;
			// next piece already available?
			if (this.next() != -1) {
				this.join(this.next());
			}
			// finished after all.
			else if (this.d.is(COMPLETE)) {
				this.closeStream();
				this.d.moveCompleted(this.fileManager);
			}
		}
	}
}

function dataCopyListener(outStream, d, chunk, offset, join) {
	this.outStream = outStream;
	this.d = d;
	this.chunk = chunk;
	this.oldoffset = offset;
	this.join = join;
}

dataCopyListener.prototype = {
	error: false,
	myOffset: 0,

	QueryInterface: function DCL_QueryInterface(iid) {
		if(
			iid.equals(Ci.nsISupports)
			|| iid.equals(Ci.nsIStreamListener)
			|| iid.equals(Ci.nsIRequestObserver)
		) return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
 	},

	onStartRequest: function DCL_onStartRequest(request, context) {
		this.join.stopRequest = request;
	},

	onStopRequest: function DCL_onStopRequest(request, context, status) {
		if (status == Components.results.NS_OK && !this.error) {
			Debug.dump(this.d.fileName + ": Join of chunk " + this.d.chunks[this.chunk].start + "-" + this.d.chunks[this.chunk].end + " completed");
			this.join.offset = this.oldoffset + this.d.chunks[this.chunk].chunkSize;
			try {
				this.d.chunks[this.chunk].remove();
			} catch(e) {}
			this.join.joinIsFinished(this.chunk);
		} else {
			Debug.dump("Error in Joining of " + this.d.fileName);
			if (!this.d.is(CANCELED)) {
				this.d.cancelDownload();
			}
			else {
				this.join.joinIsFinished(this.chunk, this.myOffset);
			}
		}
	},

	onDataAvailable: function DCL_onDataAvailable(request, context, inputStream, offset, count) {try {

		this.join.offset = this.oldoffset + offset;
		if (this.d.is(COMPLETE)) {
			this.d.setTreeCell("percent", Math.round(this.join.offset / this.d.totalSize * 100) + "%");
			this.d.setTreeProgress("inprogress", Math.round(this.join.offset / this.d.totalSize * 100));
			if (Check.isClosing)
				this.d.setTreeCell("status", _("completing"));
			else
				this.d.setTreeCell("status", _("joining"));
		}
		// need to wrap this as nsIInputStream::read is marked non-scriptable.
		var byteStream = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
		byteStream.setInputStream(inputStream);
		// we're using nsIFileOutputStream
		if (this.outStream.write(byteStream.readBytes(count), count) != count) {
			throw ("dataCopyListener::dataAvailable: read/write count mismatch!");
		}
	} catch(e) {
		this.error = true;
		request.cancel(Components.results.NS_BINDING_ABORTED);
		Debug.dump("onDataAvailable():", e);
	}
	}
}