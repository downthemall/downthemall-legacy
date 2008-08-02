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
 * The Initial Developers of the Original Code are Stefano Verna and Federico Parodi
 * Portions created by the Initial Developers are Copyright (C) 2004-2007
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Stefano Verna <stefano.verna@gmail.com>
 *    Federico Parodi <f.parodi@tiscali.it>
 *    Nils Maier <MaierMan@web.de>
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
 
const DB_FILE = 'dta_queue.sqlite';
const DB_FILE_BAK = DB_FILE + ".bak";
const DB_VERSION = 1;

Components.utils.import('resource://dta/cothread.jsm');

var SessionManager = {
	init: function() {
		this._con = Serv('@mozilla.org/storage/service;1', 'mozIStorageService')
			.openDatabase(DTA_getProfileFile(DB_FILE));
		try {
			if (('schemaVersion' in this._con) && this._con.schemaVersion != DB_VERSION) {
				/*
					migrate data
				*/
				this._con.schemaVersion = DB_VERSION;
				Debug.logString("setting schema version");				
			}
			if (!this._con.tableExists('queue')) {
				this._con.createTable('queue', 'uuid INTEGER PRIMARY KEY AUTOINCREMENT, pos INTEGER, item TEXT');
			}
		} catch (ex) {
			Debug.log("failed to create table", ex);
			// no-op
		}
		try {
			this._addStmt = this._con.createStatement('INSERT INTO queue (item) VALUES (?1)');
			this._saveStmt = this._con.createStatement('UPDATE queue SET item = ?2 WHERE uuid = ?1');
			this._savePosStmt = this._con.createStatement('UPDATE queue SET pos = ?2 WHERE uuid = ?1');
			this._delStmt = this._con.createStatement('DELETE FROM queue WHERE uuid = ?1');
		}
		catch (ex) {
			Debug.log("SQLite", this._con.lastErrorString);
			self.close();
			return;
		}

		this.load();
	},
	shutdown: function() {
		// try to kill any loaders
		if ('_loader' in this) {
			try {
				this._loader.cancel();
				this.endUpdate();
			}
			catch (ex) {
				// no-op
			}
		}
		for each (let e in ['_addStmt', '_saveStmt', '_savePosStmt', '_delStmt']) {
			try {
				this[e].finalize();
				delete this[e];
			}
			catch (ex) {
				// no-op
			}
		}
		try {
			this._con.executeSimpleSQL('VACUUM');
		}
		catch (ex) {
			// no-op
		}
		try {
			this._con.close();
			delete this._con;
		}
		catch (ex) {
			Debug.log("Cannot close!", ex);
		}
	},
	beginUpdate: function() {
		if (this._con.transactionInProgress) {
			return;
		}
		this._con.beginTransactionAs(this._con.TRANSACTION_DEFERRED);		
	},
	endUpdate: function() {
		this._con.commitTransaction();
	},
	backup: function() {
		if (!('backupDB' in this._con)) {
			Debug.logString("DB Backup not possible");
			return;
		}
		try {
			if (!this._con.backupDB(DB_FILE_BAK).exists()) {
				throw new Exception("DB Backup failed!");
			} 
		}
		catch (ex) {
			Debug.log("SessionManager: Cannot backup queue", ex);
		} 
	},
	addDownload: function(download) {
		if (!download) {
			throw new Exception("You must provide a Download to save!");
		}
		let s = this._addStmt;
		s.bindStringParameter(0, download);
		s.execute();
		s.reset();
		return this._con.lastInsertRowID;
	},
	saveDownload: function(id, download) {
		if (!download) {
			throw new Exception("You must provide a Download to save!");
		}

		let s = this._saveStmt;
		s.bindInt64Parameter(0, id);
		s.bindStringParameter(1, download);
		s.execute();
		s.reset();
	},
	savePosition: function(id, position) {
		let s = this._savePosStmt; 
		s.bindInt64Parameter(0, id);
		s.bindInt64Parameter(1, position);
		s.execute();
		s.reset();
	},
	deleteDownload: function(id) {
		if (!id) {
			return;
		}
		this._delStmt.bindInt64Parameter(0, id);
		this._delStmt.execute();
		this._delStmt.reset();
	},

	load: function() {
		let stmt = this._con.createStatement('SELECT COUNT(*) FROM queue');
		stmt.executeStep();
		let count = stmt.getInt64(0);
		stmt.finalize();
		delete stmt;
		if (!count) {
			Dialog.start();
			return;			
		}
		let loading = $('loading');

		stmt = this._con.createStatement('SELECT uuid, item FROM queue ORDER BY pos');
		this.beginUpdate();
		Tree.beginUpdate();
		this._loader = new CoThread(
			function(idx) {
				if (idx % 500 == 0) {
					loading.label = _('loading', [idx, count, Math.floor(idx * 100 / count)]);
				}
				// Are we done?
				if (!stmt || !stmt.executeStep()) {
					stmt.finalize();
					delete stmt;
					delete this._loader;
					this.endUpdate();
					Tree.endUpdate();
					Tree.invalidate();
					Dialog.start();
					return false;
				}
				
				// ... not yet.
				try {
					let dbId = stmt.getInt64(0);
					let down = Serializer.decode(stmt.getUTF8String(1));
					let get = function(attr) {
						return (attr in down) ? down[attr] : null;
					}
	
					let d = new QueueItem();
					d.dbId = dbId;
					d.urlManager = new UrlManager(down.urlManager);
					d.numIstance = get("numIstance");
	
					let referrer = get('referrer');
					if (referrer) {
						try {
							d.referrer = referrer.toURL();
						}
						catch (ex) {
							// We might have been fed with about:blank or other crap. so ignore.
						}
					}
				
					// only access the setter of the last so that we don't generate stuff trice.
					d._pathName = get('pathName');
					d._description = get('description');
					d._mask = get('mask');
					d.fileName = get('fileName');
					
					let tmpFile = get('tmpFile');
					if (tmpFile) {
						try {
							tmpFile = new FileFactory(tmpFile);
							if (tmpFile.exists()) {
								d._tmpFile = tmpFile;
							}
							else {
								// Download partfile is gone!
								// XXX find appropriate error message!
								d.fail(_("accesserror"), _("permissions") + " " + _("destpath") + ". " + _("checkperm"), _("accesserror"));
							}
						}
						catch (ex) {
							Debug.log("tried to construct with invalid tmpFile", ex);
							d.cancel();
						}
					}				
	
					d.startDate = new Date(get("startDate"));
					d.visitors = new VisitorManager(down.visitors);
					
					for each (let e in [
						'contentType',
						'conflicts',
						'postData',
						'destinationName',
						'resumable',
						'totalSize',
						'compression',
						'fromMetalink',
					]) {
						d[e] = (e in down) ? down[e] : null;
					}
	
					if (down.hash) {
						d.hash = new DTA_Hash(down.hash, down.hashType);
					}
					if ('maxChunks' in down) {
						d._maxChunks = down.maxChunks;
					}
	
					d.started = d.partialSize != 0;
					let state = get('state') 
					if (state) {
						d._state = state;
					}
					switch (d._state) {
						case PAUSED:
						case QUEUED:
						{
							for each (let c in down.chunks) {
								d.chunks.push(new Chunk(d, c.start, c.end, c.written));
							}
							d.refreshPartialSize();
							if (d._state == PAUSED) {
								d.status = TEXT_PAUSED;
							}
							else {
								d.status = TEXT_QUEUED;
							}
						}
						break;
						
						case COMPLETE:
							d.partialSize = d.totalSize;
							d.status = TEXT_COMPLETE;
						break;
						
						case CANCELED:
							d.status = TEXT_CANCELED;
						break;
					}
	
					Tree.add(d);
				}
				catch (ex) {
					Debug.log('failed to init a download from queuefile', ex);
				}
				return true;
			},
			100,
			this
		);
		this._loader.run();
	}
};