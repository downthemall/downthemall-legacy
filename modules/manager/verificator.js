/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";


const {hexdigest} = require("utils");

const SEGSIZE = (1 << 17); // 128K
const SEGNUM = 8;

const nsICryptoHash = Ci.nsICryptoHash;

exports.verify = function verify(file, hashCollection, completeCallback, progressCallback){
	return new (hashCollection.hasPartials ? _multiVerify : _verify)(
		file,
		hashCollection,
		completeCallback,
		progressCallback
		);
}

function _verify(file, hashCollection, completeCallback, progressCallback) {
	file = new Instances.LocalFile(file);
	log(LOG_DEBUG, "verifying (single): " + file.path);
	const total = file.fileSize;
	let completed = 0;

	const mainHash = new Instances.Hash(nsICryptoHash[hashCollection.full.type]);
	let flags = 0x04 | 0x08;
	if ('OS_READAHEAD' in Ci.nsILocalFile) {
		flags |= Ci.nsILocalFile.OS_READAHEAD;
		log(LOG_DEBUG, "enabled OS_READAHEAD");
	}
	const stream = new Instances.FileInputStream(file, flags, 502 /* 0766*/, 0);

	const listener = {
		QueryInterface: XPCOMUtils.generateQI([Ci.nsIStreamListener, Ci.nsIRequestObserver]),
		onStartRequest: function(r,c) {
			// nop
		},
		onStopRequest: function(r,c, result) {
			stream.close();
			if (!Components.isSuccessCode(result)) {
				completeCallback();
				return;
			}

			let actual = hexdigest(mainHash.finish(false));
			log(LOG_DEBUG, "main\nactual: " + actual + "\nexpected: " + hashCollection.full.sum);
			if (actual != hashCollection.full.sum) {
				completeCallback([{start: 0, end: 0, actual: actual, expected: hashCollection.full.sum}]);
			}
			else {
				completeCallback([]);
			}
		},
		onDataAvailable: function(r,c, inputStream, offset, count) {
			log(LOG_DEBUG, "at offset:" + offset);
			mainHash.updateFromStream(inputStream, count);
			completed += count;
			progressCallback(Math.min(completed, total));
		}
	};
	let pump = new Instances.InputStreamPump(stream, 0, -1, SEGSIZE, SEGNUM, false);
	pump.asyncRead(listener, null);
}

function _multiVerify(file, hashCollection, completeCallback, progressCallback) {
	file = new Instances.LocalFile(file);
	log(LOG_DEBUG, "verifying (multi): " + file.path);
	let mismatches = [];
	let total = file.fileSize;
	let completed = 0;

	let mainHash = new Instances.Hash(nsICryptoHash[hashCollection.full.type]);
	let flags = 0x04 | 0x08;
	if ('OS_READAHEAD' in Ci.nsILocalFile) {
		flags |= Ci.nsILocalFile.OS_READAHEAD;
		log(LOG_DEBUG, "enabled OS_READAHEAD");
	}
	let stream = new Instances.FileInputStream(file, flags, 502 /* 0766 */, 0).QueryInterface(Ci.nsISeekableStream);
	let partials = Iterator(hashCollection.partials);
	let partial = partials.next()[1];
	log(LOG_DEBUG, partial.toSource());
	let partialHash = new Instances.Hash(nsICryptoHash[partial.type]);
	let partialPending = hashCollection.parLength;
	let start = 0;

	const listenerMain = {
		QueryInterface: XPCOMUtils.generateQI([Ci.nsIStreamListener, Ci.nsIRequestObserver]),
		onStartRequest: function(r,c) {
			// nop
		},
		onStopRequest: function(r,c, result) {
			po.close();
		},
		onDataAvailable: function(r,c, inputStream, offset, count) {
			log(LOG_DEBUG, "at offset:" + offset);
			mainHash.updateFromStream(inputStream, count);
			completed += count;
			progressCallback(Math.min(completed, total));
		}
	};
	const listenerPartials = {
		QueryInterface: XPCOMUtils.generateQI([Ci.nsIStreamListener, Ci.nsIRequestObserver]),
		onStartRequest: function(r,c) {
			// nop
		},
		onStopRequest: function(r,c, result) {
			stream.close();
			if (!Components.isSuccessCode(result)) {
				completeCallback();
				return;
			}

			// last partial?
			if (partial) {
				let partialActual = hexdigest(partialHash.finish(false));
				log(LOG_DEBUG, "last partial\nactual: " + partialActual + "\nexpected: " + partial.sum);
				if (partial.sum != partialActual) {
					mismatches.push({
						start: start,
						end: total - 1,
						actual: partialActual,
						expected: partial.sum
					});
				}
			}
			let actual = hexdigest(mainHash.finish(false));
			log(LOG_DEBUG, "main\nactual: " + actual + "\nexpected: " + hashCollection.full.sum);
			if (actual != hashCollection.full.sum) {
				completeCallback([{start: 0, end: 0, actual: actual, expected: hashCollection.full.sum}]);
			}
			else {
				completeCallback([]);
			}
		},
		onDataAvailable: function(r,c, inputStream, offset, count) {
			log(LOG_DEBUG, "at offset:" + offset);
			try {
				let pending = count;
				while (partial && pending) {
					let read = Math.min(partialPending, pending);
					partialHash.updateFromStream(inputStream, read);
					partialPending -= read;
					pending -= read;

					if (partialPending == 0) {
						let partialActual = hexdigest(partialHash.finish(false));
						log(LOG_DEBUG, "partial\nactual: " + partialActual + "\nexpected: " + partial.sum);
						if (partial.sum != partialActual) {
							mismatches.push({
								start: start,
								end: start + hashCollection.parLength,
								actual: partialActual,
								expected: partial.sum
							});
						}
						try {
							partial = partials.next()[1];
							partialHash = new Instances.Hash(nsICryptoHash[partial.type]);
							partialPending = hashCollection.parLength;
							start += partialPending;
						}
						catch (ex) {
							partial = null;
						}
					}
				}
			}
			catch (ex) {
				log(LOG_ERROR, "failed to process multi", ex);
				throw ex;
			}
		}
	};
	const {
		inputStream: pi,
		outputStream: po
		} = new Instances.Pipe(false, true, SEGSIZE, SEGNUM, null);
	let tee = new Instances.StreamListenerTee(listenerMain, po);
	new Instances.InputStreamPump(stream, 0, -1, SEGSIZE, SEGNUM, false).asyncRead(tee, null);
	new Instances.InputStreamPump(pi, 0, -1, SEGSIZE, SEGNUM, true).asyncRead(listenerPartials, null);
}
