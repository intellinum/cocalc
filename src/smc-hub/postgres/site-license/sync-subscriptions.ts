/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*

/*
Ensure all (or just for given account_id) site license subscriptions
are non-expired iff subscription in stripe is "active" or "trialing".  This actually
uses the "stripe_customer" field of the user account, so its important
that *that* is valid.

2021-03-29: this also checks for expired licenses, where there was a subscription
without a set expiration date, but now there is no subscription any more.
This is only run if there is no specific account_id set.
*/

import * as debug from "debug";
const L = debug("hub:sync-subscriptions");

import { PostgreSQL } from "../types";
import { TIMEOUT_S } from "./const";
import { delay } from "awaiting";

// wait this long after writing to the DB, to avoid overwhelming it...
const WAIT_AFTER_UPDATE_MS = 10;

// this is each entry in the "data" field of what's in the DB in stripe_customer -> subscriptions
interface Subscription {
  id: string; // e.g.  sub_XXX...
  metadata: { license_id?: string; account_id?: string };
  object: string; // "subscription"
  status: string;
  created: number;
  customer: string; // cus_XXXX...
}

interface RawSubscriptions {
  rows: {
    sub?: {
      data: Subscription[];
    };
  }[];
}

// map of license_id → list of subscription infos
type LicenseSubs = {
  [license_id: string]: Subscription[];
};

type LicenseInfo = {
  [license_id: string]: { expires: Date | undefined; trial: boolean };
};

// Get all license expire times from database at once, so we don't
// have to query for each one individually, which would take a long time.
// If account_id is given, we only get the licenses with that user
// as a manager.
// TODO: SCALABILITY WARNING
async function get_licenses(
  db: PostgreSQL,
  account_id?: string,
  expires_unset = false
): Promise<LicenseInfo> {
  const query = {
    select: ["id", "expires", "info"],
    table: "site_licenses",
  } as { select: string[]; table: string; where?: string; params?: string[] };
  if (account_id != null && expires_unset) {
    throw new Error("account_id requires expires_unset == false");
  }
  if (account_id != null) {
    query.where = "$1 = ANY(managers)";
    query.params = [account_id];
  } else if (expires_unset) {
    query.where = "expires IS NULL";
  }
  const results = await db.async_query(query);
  const licenses: LicenseInfo = {};
  for (const x of results.rows) {
    licenses[x.id] = { expires: x.expires, trial: x.info?.trial === true };
  }
  return licenses;
}

// Get *all* stripe subscription data from the database.
// TODO: SCALABILITY WARNING
// TODO: Only the last 10 subs are here, I think, so an old sub might not get properly expired
// for a user that has 10+ subs.  Worry about this when there are such users; maybe there never will be.
async function get_subs(
  db: PostgreSQL,
  account_id?: string
): Promise<LicenseSubs> {
  const subs: RawSubscriptions = await db.async_query({
    select: "stripe_customer#>'{subscriptions}' as sub",
    table: "accounts",
    where:
      account_id == null ? "stripe_customer_id IS NOT NULL" : { account_id },
    timeout_s: TIMEOUT_S,
  });

  const ret: LicenseSubs = {};
  for (const x of subs.rows) {
    if (x.sub?.data == null) continue;
    for (const sub of x.sub.data) {
      const license_id = sub.metadata.license_id;
      if (license_id == null) {
        continue; // not a license
      }
      if (ret[license_id] == null) {
        ret[license_id] = [];
      } else {
        L(`more than one subscription for license '${license_id}'`);
      }
      ret[license_id].push(sub);
    }
  }
  return ret;
}

// there should only be one subscription per license id, but who knows ...
function* iter(subs: LicenseSubs) {
  for (const [license_id, sub_list] of Object.entries(subs)) {
    for (const sub of sub_list) {
      yield { license_id, sub };
    }
  }
}

export async function sync_site_license_subscriptions(
  db: PostgreSQL,
  account_id?: string,
  test_mode = false
): Promise<number> {
  test_mode = test_mode || !!process.env.DRYRUN;
  if (test_mode) L(`DRYRUN TEST MODE -- UPDATE QUERIES ARE DISABLED`);

  const licenses: LicenseInfo = await get_licenses(db, account_id);
  const subs = await get_subs(db, account_id);

  let n = 0;
  for (const { license_id, sub } of iter(subs)) {
    const expires: Date | undefined = licenses[license_id].expires;
    if (sub.status == "active" || sub.status == "trialing") {
      // make sure expires is not set
      if (expires != null) {
        if (test_mode) {
          L(`DRYRUN: set 'expires = null' where license_id='${license_id}'`);
        } else {
          await db.async_query({
            query: "UPDATE site_licenses",
            set: { expires: null },
            where: { id: license_id },
          });
        }
        await delay(WAIT_AFTER_UPDATE_MS);
        n += 1;
      }
    } else {
      // status is something other than active, so make sure license *is* expired.
      // It will only un-expire when the subscription is active again.
      if (expires == null || expires > new Date()) {
        if (test_mode) {
          L(
            `DRYRUN: set 'expires = ${new Date().toISOString()}' where license_id='${license_id}'`
          );
        } else {
          await db.async_query({
            query: "UPDATE site_licenses",
            set: { expires: new Date() },
            where: { id: license_id },
          });
        }
        await delay(WAIT_AFTER_UPDATE_MS);
        n += 1;
      }
    }
  }

  if (account_id == null) {
    n += await expire_cancelled_subscriptions(db, subs, test_mode);
  }

  return n;
}

// this handles the case when the subscription, which is funding a license key, has been cancelled.
// hence this checks all active licenses if there is still an associated subscription.
// if not, the license is expired.
async function expire_cancelled_subscriptions(
  db: PostgreSQL,
  subs: LicenseSubs,
  test_mode: boolean
): Promise<number> {
  let n = 0;
  const licenses: LicenseInfo = await get_licenses(db, undefined, true);

  for (const license_id in licenses) {
    // the query above already filtered by exires == null
    let found = subs[license_id] != null && subs[license_id].length > 0;
    if (found) {
      L(`license_id '${license_id}' is funded by '${subs[license_id][0].id}'`);
      found = true;
    } else {
      const msg = `license_id '${license_id}' is not funded by any subscription`;
      // maybe trial without expiration?
      if (licenses[license_id].trial) {
        L(`${msg}, but it is a trial`);
      } else {
        L(`${msg}`);
        if (test_mode) {
          L(
            `DRYRUN: set 'expires = ${new Date().toISOString()}' where license_id='${license_id}'`
          );
        } else {
          await db.async_query({
            query: "UPDATE site_licenses",
            set: { expires: new Date() },
            where: { id: license_id },
          });
        }
        await delay(WAIT_AFTER_UPDATE_MS);
        n += 1;
      }
    }
  }

  return n;
}
