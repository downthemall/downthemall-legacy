/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// This module is present to define limited use of cpows as required
// Please note that the CPOW usage is stil supposed to be "safe". Otherwise a
// warning should be logged still by the js engine.
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1283681#c15
Cu.permitCPOWsInScope(this);

exports.onForm = target => 'form' in target;
