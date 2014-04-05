/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const DB_OLD_FILE = 'dta_queue.sqlite';
const DB_FILE = "queue.sqlite";
const DB_FILE_BROKEN = 'queue.broken';
const DB_FILE_BAK = DB_FILE + ".bak";
const DB_VERSION = 2;

const STMT_SELECT = 'SELECT uuid, item, pos FROM queue ORDER BY pos';

const Timers = new (require("support/timers").TimerManager)();
const obs = require("support/observers");

let _connection = null;
let _saveStmt = null;
let _saveStmtParams = null;
let _timer = 0;

/* global __db */
lazy(this, '__db', function() {
	let db = require("api").getProfileFile(DB_FILE);
	if (!db.exists()) {
		let olddb = Services.dirsvc.get("ProfD", Ci.nsIFile);
		olddb.append(DB_OLD_FILE);
		if (olddb.exists()) {
			try {
				olddb.moveTo(db.parent, db.leafName);
			}
			catch (ex) {
				log(LOG_ERROR, "Failed to move DB to new location; locked?", ex);
				return olddb;
			}
		}
	}
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
			broken.moveTo(broken.parent, DB_FILE_BROKEN);
			_connection = Services.storage.openDatabase(__db);
		}

		try {
			if (('schemaVersion' in _connection) && _connection.schemaVersion !== DB_VERSION) {
				/*
					migrate data
				*/
				_connection.executeSimpleSQL("DROP TRIGGER IF EXISTS delete_qi_reposition");

				_connection.schemaVersion = DB_VERSION;
				log(LOG_DEBUG, "setting schema version");
			}
			if (!_connection.tableExists('queue')) {
				_connection.createTable('queue', 'uuid INTEGER PRIMARY KEY AUTOINCREMENT, pos INTEGER, item TEXT');
			}
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
		obs.notifyLocal(null, 'DTA:shutdownQueueStore', null);

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
		if (topic === "profile-change-teardown") {
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
	queueDownload: function(download, position) {
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
		if (!id) {
			return;
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
		if (_saveStmtParams.length) {
			stmt.bindParameters(_saveStmtParams);
			stmt.executeAsync();
		}
		_saveStmt = null;
		_saveStmtParams = null;
		_timer = null;
	},
	savePositions: function(downloads) {
		if (!downloads.length) {
			log(LOG_DEBUG, "no position changes");
			return;
		}

		let stmt = _connection.createAsyncStatement("UPDATE queue SET pos = ? WHERE uuid = ?");
		let params = stmt.newBindingParamsArray();
		for (let d of downloads) {
			if (!d.dbId) {
				continue;
			}
			let bp = params.newBindingParams();
			bp.bindByIndex(0, d.position);
			bp.bindByIndex(1, d.dbId);
			params.addParams(bp);
		}
		if (params.length) {
			stmt.bindParameters(params);
			stmt.executeAsync();
		}
	},
	getSavePositionsByOffset: function() {
		let stmt = _connection.createAsyncStatement("UPDATE queue SET pos = pos - :off WHERE pos >= :pos");
		return Object.freeze({
			execute: function(pos, off) {
				stmt.params.off = off;
				stmt.params.pos = pos;
				stmt.executeAsync();
			},
			finalize: function() {
				stmt.finalize();
				stmt = null;
			}
		});
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
		let stmt = _connection.createStatement('DELETE FROM queue WHERE uuid = :uuid');
		try {
			if (downloads.length < 50) {
				for (let d of downloads) {
					if (!d.dbId) {
						continue;
					}
					stmt.params.uuid = d.dbId;
					stmt.executeAsync();
				}
				return;
			}

			let params = stmt.newBindingParamsArray();
			for (let d of downloads) {
				if (!d.dbId) {
					continue;
				}
				let bp = params.newBindingParams();
				bp.bindByIndex(0, d.dbId);
				params.addParams(bp);
			}
			if (params.length) {
				stmt.bindParameters(params);
				stmt.executeAsync();
			}
		}
		finally {
			stmt.finalize();
		}
	},
	loadItems: function(callback, ctx) {
		function Item(row) {
			this.id = row.getResultByIndex(0);
			this.item = JSON.parse(row.getResultByIndex(1));
			this.pos = row.getResultByIndex(2);
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
obs.add(QueueStore, "profile-change-teardown");

unload(function() {
	try {
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
