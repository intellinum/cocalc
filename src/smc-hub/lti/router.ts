import * as express from "express";
import * as uuid from "uuid";
import * as querystring from "querystring";
import * as jwt from "jsonwebtoken";
import * as jwksClient from "jwks-rsa";
import * as path from "path";

import { inspect } from "util";

import {
  IssuerData,
  LoginInitiationFromPlatform,
  AuthRequestTokenData
} from "./types";

const SMC_ROOT: string = process.env.SMC_ROOT as any;
const STATIC_PATH = path.join(SMC_ROOT, "static");

const privateKEY = ";lkjasdf;lkjsad;cklmrcrae";

const active_selection_sessions: {
  [key: string]: {
    iss: string;
    aud: string | string[];
    iat: number;
    exp: number;
    nonce: string;
    header: {
      typ: "JWT";
      alg: "RS256";
    };
    "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiDeepLinkingResponse";
    "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0";
    "https://purl.imsglobal.org/spec/lti/claim/deployment_id": string;
    "https://purl.imsglobal.org/spec/lti-dl/claim/data": string;
    "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": {
      type: string;
      title: string;
      url: string;
    }[];
  };
} = {};

export function init_LTI_router(opts: { base_url: string }): express.Router {
  const router = express.Router();
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  router.route("/").all(function(_, res) {
    res.sendFile(path.join(STATIC_PATH, "lti.html"), { maxAge: 0 });
  });

  // https://www.imsglobal.org/spec/security/v1p0/#openid_connect_launch_flow
  // 5.1.1
  router.route("/login").all((req, res) => {
    const token: LoginInitiationFromPlatform = req.body;
    const iss_data = get_iss_data(token.iss);
    const nonce = uuid.v4();
    const state = uuid.v4();

    console.log("ROUTE: Login\n\n\n\n", state);

    const auth_params: AuthRequestTokenData = {
      scope: "openid",
      response_type: "id_token",
      response_mode: "form_post",
      prompt: "none",
      client_id: iss_data.client_id,
      redirect_uri: token.target_link_uri,
      login_hint: token.login_hint,
      state: state,
      nonce: nonce,
      lti_message_hint: token.lti_message_hint,
      id_token_hint: token.lti_message_hint
    };
    begin_auth_flow(nonce, auth_params);
    const query_string = querystring.stringify(auth_params);
    res.redirect(iss_data.auth_url + "?" + query_string);
  });

  // Tool Launch URL
  router.post("/launch", (req, res) => {
    if (req.body.error) {
      res.send(`Recieved error ${req.body.error}`);
    }
    const options = { algorithms: ["RS256"] };

    // TODO #V0: Use verify for security
    jwt.verify(req.body.id_token, getKey, options, function(err, token) {
      if (err) {
        res.send("Error parsing jwt:" + err);
      }
      const details = get_auth_flow(token.nonce);
      res.redirect(opts.base_url);
      console.log(`${inspect(details)}`);
    });
  });

  router.route("/deep-link-select").all((req, res) => {
    if (req.body.error) {
      res.send(`Recieved error ${req.body.error}`);
    }

    console.log("ROUTE =========\n\n\n");
    console.log(inspect(req.body));

    const options = { algorithms: ["RS256"] };

    // TODO #V0: Use verify for security
    jwt.decode(req.body.id_token, options, function(err, token) {
      console.log("Finished parsing id_token", inspect(token));
      if (err) {
        res.send("Error parsing jwt:" + err);
      }

      res.sendFile(path.join(STATIC_PATH, "lti.html"), { maxAge: 0 });
    });
  });

  router.post("/return-deep-link", (req, res) => {
    // TODO: Receive data from front end

    // https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
    const jwt_data = active_selection_sessions[req.body.state];
    jwt_data.nonce = uuid.v4();
    const redirect_url =
      jwt_data[
        "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
      ].deep_link_return_url;
    const deep_link_response_token = jwt.sign(jwt_data, privateKEY, {
      algorithm: "RS256"
    });

    const formatted_token = { JWT: deep_link_response_token };
    const query_string = querystring.stringify(formatted_token);
    res.redirect(redirect_url + "&" + query_string);
  });

  return router;
}

function get_iss_data(iss: string): IssuerData {
  // TODO #V0 Remove when you write a way to save it to the database
  const known_iss = {
    "https://moodletest.cocalc.com": {
      client_id: "6WDU5UmGFK9mFFd",
      token_url: "https://moodletest.cocalc.com/mod/lti/token.php",
      auth_url: "https://moodletest.cocalc.com/mod/lti/auth.php",
      jwk_url: "https://moodletest.cocalc.com/mod/lti/certs.php"
    },
    "https://canvas.instructure.com": {
      client_id: "10000000000008",
      token_url: "http://34.83.75.255/api/lti/login/oauth2/auth",
      auth_url: "http://34.83.75.255/api/lti/authorize",
      jwk_url: "http://34.83.75.255/api/lti/securit/jwks"
    }
  };

  return known_iss[iss];
}

const current_auth_flows = {};

function begin_auth_flow(id: string, payload: any) {
  current_auth_flows[id] = payload;
}

function get_auth_flow(id: string): any {
  return current_auth_flows[id] || "Nothing here";
}

const jwkClient = jwksClient({
  jwksUri: "https://moodletest.cocalc.com/mod/lti/certs.php"
});

function getKey(header, callback) {
  jwkClient.getSigningKey(header.kid, function(_, key) {
    var signingKey = (key as any).publicKey || (key as any).rsaPublicKey;
    callback(null, signingKey);
  });
}