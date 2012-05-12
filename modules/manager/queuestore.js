/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const DB_FILE = 'dta_queue.sqlite';
const DB_FILE_BROKEN = 'dta_queue.broken';
const DB_FILE_BAK = DB_FILE + ".bak";
const DB_VERSION = 1;

const STMT_SELECT = 'SELECT uuid, item FROM queue ORDER BY pos';

const {Logger} = requireJSM("resource://dta/utils.jsm");

const pbm = require("support/pbm");
const Timers = new (require("support/timers").TimerManager)();

let _connection = null;
let _saveStmt = null;
let _saveStmtParams = null;
let _timer = 0;


lazy(this, '__db', function() {
	let db = Services.dirsvc.get("ProfD", Ci.nsIFile);
	db.append(DB_FILE);
	return db;
});

const QueueStore = {
	_initialized: false,
	_private: false,
	init: function(pb) {
		if (this._initialized) {
			return;
		}
		this._initialized = true;

		if (Logger.enabled) {
			Logger.log("QueueStore: initialzing in " + (pb ? "private" : "normal") + " mode");
		}

		try {
			if (pb) {
				_connection = Services.storage.openSpecialDatabase("memory");
				this._private = true;
			}
			else {
				_connection = Services.storage.openDatabase(__db);
				this._private = false;
			}
		}
		catch (ex) {
			if (!pb) {
				if (Logger.enabled) {
					Logger.log("DB appears broken; backing up and restart", ex);
				}
				try {
					let cbroken = __db.clone();
					cbroken.leafName = DB_FILE_BROKEN;
					if (cbroken.exists()) {
						cbroken.remove(false);
					}
				}
				catch (iex) {
					if (Logger.enabled) {
						Logger.log("Couldn't remove old broken queue file", iex);
					}
				}
				let broken = __db.clone();
				broken.moveTo(null, DB_FILE_BROKEN);
				_connection = Services.storage.openDatabase(__db);
			}
		}

		try {
			if (('schemaVersion' in _connection) && _connection.schemaVersion != DB_VERSION) {
				/*
					migrate data
				*/
				_connection.schemaVersion = DB_VERSION;
				if (Logger.enabled) {
					Logger.log("setting schema version");
				}
			}
			if (!_connection.tableExists('queue')) {
				_connection.executeSimpleSQL('PRAGMA page_size = 4096');
				_connection.createTable('queue', 'uuid INTEGER PRIMARY KEY AUTOINCREMENT, pos INTEGER, item TEXT');
			}
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("failed to create table", ex);
			}
			// no-op
		}
		try {
			if (!pb) {
				_connection.executeSimpleSQL("PRAGMA journal_mode = MEMORY");
			}
			_connection.executeSimpleSQL("PRAGMA synchronous = NORMAL");
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("SQLite", _connection.lastErrorString);
			}
		}
		if (Logger.enabled) {
			Logger.log("QueueStore: done initialzing");
		}
	},
	shutdown: function() {
		if (!this._initialized) {
			return;
		}

		// give manager a chance to save running
		Services.obs.notifyObservers(null, 'DTA:shutdownQueueStore', null);

		this._initialized = false;
		// finish any pending operations
		this.flush();
		try {
			_connection.createAsyncStatement("VACUUM").executeAsync();
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("VACUUM failed!", ex);
			}
		}
		try {
			_connection.asyncClose();
			_connection = null;
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("Cannot close!", ex);
			}
		}
		if (Logger.enabled) {
			Logger.log("QueueStore: shutdown complete!");
		}
	},
	reinit: function(pb) {
		this.shutdown();
		this.init(pb);
	},
	clear: function() {
		this.shutdown();
		try {
			if (__db.exists()) {
				__db.remove(false);
			}
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("QueueStore: Cannot remove DB", ex);
			}
		}
		this.init(this._private);
		Services.storage.notifyObservers(null, 'DTA:clearedQueueStore', null);
	},
	enterPrivateBrowsing: function() {
		if (Logger.enabled) {
			Logger.log("QueueManager: entering pbm");
		}
		this.reinit(true);
	},
	exitPrivateBrowsing: function() {
		if (Logger.enabled) {
			Logger.log("QueueManager: exiting pbm");
		}
		this.reinit(false);
	},
	beginUpdate: function() {
		if (_connection.transactionInProgress) {
			if (Logger.enabled) {
				Logger.log("Transaction already in progress; FIXME");
			}
			return;
		}
		_connection.beginTransactionAs(_connection.TRANSACTION_DEFERRED);
	},
	endUpdate: function() {
		if (!_connection.transactionInProgress) {
			return;
		}
		_connection.commitTransaction();
	},
	backup: function() {
		if (!('backupDB' in _connection)) {
			if (Logger.enabled) {
				Logger.log("DB Backup not possible");
			}
			return;
		}
		try {
			if (!_connection.backupDB(DB_FILE_BAK).exists()) {
				throw new Exception("DB Backup failed!");
			}
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("QueueStore: Cannot backup queue", ex);
			}
		}
	},
	addDownload: function(download, position) {
		if (!download) {
			throw new Exception("You must provide a Download to save!");
		}
		let stmt = _connection.createStatement('INSERT INTO queue (pos, item) VALUES (:position, :item)');
		stmt.params.position = position;
		stmt.params.item = download;
		stmt.execute();
		stmt.finalize();
		return _connection.lastInsertRowID;
	},
	saveDownload: function(id, download) {
		if (!download) {
			throw new Exception("You must provide a Download to save!");
		}
		if (!_saveStmt) {
			_saveStmt = _connection.createAsyncStatement('UPDATE queue SET item = :item WHERE uuid = :uuid');
			_saveStmtParams = _saveStmt.newBindingParamsArray();
		}

		let bp = _saveStmtParams.newBindingParams();
		bp.bindByName("item", download);
		bp.bindByName("uuid", id);
		_saveStmtParams.addParams(bp);

		if (!_timer) {
			// delay up to 5000 msecs
			_timer = Timers.createOneshot(5000, this._saveDownloadQueue, this);
		}
	},
	_saveDownloadQueue: function() {
		if (!_saveStmt) {
			return;
		}
		let stmt = _saveStmt;
		stmt.bindParameters(_saveStmtParams);
		_saveStmt = null;
		_saveStmtParams = null;
		_timer = null;

		stmt.executeAsync();
	},
	asyncSavePosition: function(downloads) {
		if (downloads.length == 0) {
			if (Logger.enabled) {
				Logger.log("no position changes");
			}
			return;
		}
		let stmt = _connection.createAsyncStatement("UPDATE queue SET pos = :pos WHERE uuid = :uuid");
		let params = stmt.newBindingParamsArray();
		for each (let d in downloads) {
			let bp = params.newBindingParams();
			bp.bindByName("pos", d.position);
			bp.bindByName("uuid", d.dbId);
			params.addParams(bp);
		}
		stmt.bindParameters(params);
		stmt.executeAsync();
	},
	deleteDownload: function(id) {
		if (!id) {
			return;
		}
		let stmt = _connection.createAsyncStatement('DELETE FROM queue WHERE uuid = :uuid');
		stmt.params.uuid = id;
		stmt.executeAsync();
	},
	deleteDownloads: function(downloads) {
		this.beginUpdate();
		try {
			let stmt = _connection.createStatement('DELETE FROM queue WHERE uuid = :uuid');
			try {
				for (let i = 0; i < downloads.length; ++i) {
					stmt.params.uuid = downloads[i].dbId;
					stmt.execute();
					stmt.reset();
				}
			}
			finally {
				stmt.finalize();
			}
		}
		finally {
			this.endUpdate();
		}
	},
	loadItems: function(callback, ctx) {
		function Item(row) {
			this.id = row.getResultByIndex(0);
			this.item = JSON.parse(row.getResultByIndex(1));
		}

		ctx = ctx || null;
		let stmt;
		try {
			stmt = _connection.createAsyncStatement(STMT_SELECT);
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("SQLite", _connection.lastErrorString);
			}
			callback.call(ctx, null);
		}
		let rows = [];
		stmt.executeAsync({
			handleResult: function(aResult) {
				for (let row = aResult.getNextRow(); row; row = aResult.getNextRow()) {
					rows.push(new Item(row));
				}
			},
			handleError: function(aError) {
				if (Logger.enabled) {
					Logger.log('failed load queue file', aError);
				}
				callback.call(ctx, null);
			},
			handleCompletion: function(aReason) {
				stmt.finalize();
				let count = rows.length;
				rows.forEach(function(e) e.count = count);
				if (Logger.enabled) {
					Logger.log("All your callback are belong to us");
				}
				callback.call(ctx, rows);
			}
		});
	},
	flush: function() {
		this._saveDownloadQueue();
	},
	getQueueSeq: function() {
		let stmt = _connection.createStatement("SELECT seq FROM SQLITE_SEQUENCE WHERE name LIKE '%queue%'");
		let rv = 0;
		if (stmt.executeStep()) {
			rv = stmt.getInt64(0);
		}
		stmt.finalize();
		stmt = null;
		return rv.toString();
	}
};

unload(function() {
	try {
		pbm.unregiszterCallbacks(QueueStore);
		QueueStore.shutdown();
	}
	catch (ex) {
		if (Logger.enabled) {
			Logger.log("Failed to shutdown QueueStore", ex);
		}
	}
});

pbm.registerCallbacks(QueueStore);
QueueStore.init();

exports.QueueStore = QueueStore;
