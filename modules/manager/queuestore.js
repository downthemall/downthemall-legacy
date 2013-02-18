/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const DB_FILE = 'dta_queue.sqlite';
const DB_FILE_BROKEN = 'dta_queue.broken';
const DB_FILE_BAK = DB_FILE + ".bak";
const DB_VERSION = 1;

const STMT_SELECT = 'SELECT uuid, item FROM queue ORDER BY pos';

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
	QueryInterface: QI([Ci.nsIObserver,]),
	_initialized: false,
	init: function() {
		if (this._initialized) {
			return;
		}
		this._initialized = true;

		try {
			_connection = Services.storage.openDatabase(__db);
		}
		catch (ex) {
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

		try {
			if (('schemaVersion' in _connection) && _connection.schemaVersion != DB_VERSION) {
				/*
					migrate data
				*/
				_connection.schemaVersion = DB_VERSION;
				log(LOG_DEBUG, "setting schema version");
			}
			if (!_connection.tableExists('queue')) {
				_connection.createTable('queue', 'uuid INTEGER PRIMARY KEY AUTOINCREMENT, pos INTEGER, item TEXT');
			}
			_connection.executeSimpleSQL("CREATE TRIGGER IF NOT EXISTS delete_qi_reposition " +
					"AFTER DELETE ON queue " +
					"FOR EACH ROW BEGIN " +
					"UPDATE queue SET pos = pos - 1 WHERE pos > old.pos; " +
					"END");
		}
		catch (ex) {
			log(LOG_ERROR, "failed to create table", ex);
			// no-op
		}
		try {
			_connection.executeSimpleSQL("PRAGMA journal_mode = MEMORY");
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
			_connection.asyncClose();
			_connection = null;
		}
		catch (ex) {
			log(LOG_ERROR, "Cannot close!", ex);
		}
		log(LOG_INFO, "QueueStore: shutdown complete!");
	},
	reinit: function() {
		this.shutdown();
		this.init();
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
		this.init();
		Services.storage.notifyObservers(null, 'DTA:clearedQueueStore', null);
	},
	observe: function(s,topic,d) {
		if (topic == "profile-change-teardown") {
			this.shutdown();
		}
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
			_saveStmt = _connection.createAsyncStatement('UPDATE queue SET item = ? WHERE uuid = ?');
			_saveStmtParams = _saveStmt.newBindingParamsArray();
		}

		let bp = _saveStmtParams.newBindingParams();
		bp.bindByIndex(0, download);
		bp.bindByIndex(1, id);
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

		let stmt = _connection.createAsyncStatement("UPDATE queue SET pos = ? WHERE uuid = ?");
		let params = stmt.newBindingParamsArray();
		for (let d of downloads) {
			let bp = params.newBindingParams();
			bp.bindByIndex(0, d.position);
			bp.bindByIndex(1, d.dbId);
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
	syncDeleteDownloads: function(downloads) {
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

QueueStore.init();
Services.obs.addObserver(QueueStore, "profile-change-teardown", false);

unload(function() {
	try {
		Services.obs.removeObserver(QueueStore, "profile-change-teardown");
		QueueStore.shutdown();
	}
	catch (ex) {
		log(LOG_ERROR, "Failed to shutdown QueueStore", ex);
	}
});

function VacuumParticipant() {}
VacuumParticipant.prototype = Object.freeze({
	classDescription: "DownThemAll! QueueStore Vacuum Participant",
	classID: Components.ID("{c2f27651-9db2-438a-bcc7-f9e9bb2e3393}"),
	contractID: "@downthemall.net/vacuum-participant;1",
	xpcom_categories: ["vacuum-participant"],
	QueryInterface: QI([Ci.mozIStorageVacuumParticipant]),

	expectedDatabasePageSize: Ci.mozIStorageConnection.DEFAULT_PAGE_SIZE,
	get databaseConnection() _connection,
	onBeginVacuum: function() {
		log(LOG_DEBUG, "QueueStore: onBeginVacuum");
		return !_connection.transactionInProgress;
	},
	onEndVacuum: function(aSucceeded) {
		log(LOG_DEBUG, "QueueStore: onEndVacuum, " + aSucceeded.toString());
	}
});
require("components").registerComponents([VacuumParticipant]);

exports.QueueStore = QueueStore;
