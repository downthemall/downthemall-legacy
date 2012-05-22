/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const DB_FILE = 'dta_queue.sqlite';
const DB_FILE_BROKEN = 'dta_queue.broken';
const DB_FILE_BAK = DB_FILE + ".bak";
const DB_VERSION = 1;

const STMT_SELECT = 'SELECT uuid, item FROM queue ORDER BY pos';

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

		log(LOG_INFO, "QueueStore: initialzing in " + (pb ? "private" : "normal") + " mode");

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
				log(LOG_ERROR, "DB appears broken; backing up and restart", ex);
				try {
					let cbroken = __db.clone();
					cbroken.leafName = DB_FILE_BROKEN;
					if (cbroken.exists()) {
						cbroken.remove(false);
					}
				}
				catch (iex) {
					log(LOG_ERROR, "Couldn't remove old broken queue file", iex);
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
				log(LOG_DEBUG, "setting schema version");
			}
			if (!_connection.tableExists('queue')) {
				_connection.executeSimpleSQL('PRAGMA page_size = 4096');
				_connection.createTable('queue', 'uuid INTEGER PRIMARY KEY AUTOINCREMENT, pos INTEGER, item TEXT');
			}
		}
		catch (ex) {
			log(LOG_ERROR, "failed to create table", ex);
			// no-op
		}
		try {
			if (!pb) {
				_connection.executeSimpleSQL("PRAGMA journal_mode = MEMORY");
			}
			_connection.executeSimpleSQL("PRAGMA synchronous = NORMAL");
		}
		catch (ex) {
			log(LOG_ERROR, "SQLite", _connection.lastErrorString);
		}
		log(LOG_INFO, "QueueStore: done initialzing");
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
			log(LOG_ERROR, "VACUUM failed!", ex);
		}
		try {
			_connection.asyncClose();
			_connection = null;
		}
		catch (ex) {
			log(LOG_ERROR, "Cannot close!", ex);
		}
		log(LOG_INFO, "QueueStore: shutdown complete!");
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
			log(LOG_ERROR, "QueueStore: Cannot remove DB", ex);
		}
		this.init(this._private);
		Services.storage.notifyObservers(null, 'DTA:clearedQueueStore', null);
	},
	observe: function(s,topic,d) {
		if (topic == "profile-change-teardown") {
			this.shutdown();
		}
	},
	enterPrivateBrowsing: function() {
		log(LOG_INFO, "QueueManager: entering pbm");
		this.reinit(true);
	},
	exitPrivateBrowsing: function() {
		log(LOG_INFO, "QueueManager: exiting pbm");
		this.reinit(false);
	},
	beginUpdate: function() {
		if (_connection.transactionInProgress) {
			log(LOG_ERROR, "Transaction already in progress; FIXME");
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
			log(LOG_ERROR, "DB Backup not possible");
			return;
		}
		try {
			if (!_connection.backupDB(DB_FILE_BAK).exists()) {
				throw new Exception("DB Backup failed!");
			}
		}
		catch (ex) {
			log(LOG_ERROR, "QueueStore: Cannot backup queue", ex);
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
			log(LOG_DEBUG, "no position changes");
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
			log(LOG_ERROR, "SQLite", _connection.lastErrorString);
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
				log(LOG_ERROR, 'failed load queue file', aError);
				callback.call(ctx, null);
			},
			handleCompletion: function(aReason) {
				stmt.finalize();
				let count = rows.length;
				rows.forEach(function(e) e.count = count);
				log(LOG_DEBUG, "All your callback are belong to us");
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

pbm.registerCallbacks(QueueStore);
QueueStore.init();
Services.obs.addObserver(QueueStore, "profile-change-teardown", false);

unload(function() {
	try {
		pbm.unregisterCallbacks(QueueStore);
		Services.obs.removeObserver(QueueStore, "profile-change-teardown");
		QueueStore.shutdown();
	}
	catch (ex) {
		log(LOG_ERROR, "Failed to shutdown QueueStore", ex);
	}
});

exports.QueueStore = QueueStore;
