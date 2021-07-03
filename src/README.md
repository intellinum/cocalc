# How to work with this

## Initial build

```sh
npm run make
```

This will do `npm ci` for all packages, and also build the typescript/coffeescript, and anything else into a dist directory for each module.

You can also delete all the `node_modules` and `dist` directories in all packages
```sh
npm run clean
```

## Starting webpack

```sh
npm run webpack
```
That will change to the `packages/static` directory where `npm run webpack` is actually run.

## Starting the development hub

```sh
npm run hub
```
That will ensure the latest version of the hub Typescript and Coffeescript gets compiled, will quit any running hubs and projects, and start a new hub running, showing the log files.

## Status of packages
```sh
npm run status
```
or to just see status for a specific package or packages
```sh
npm run status --packages=static,smc-webapp
```

This uses git and package.json to show you which files (in the package directory!) have changed since this package was last published to npmjs.  To see the diff:
```sh
npm run diff
```

## Publishing to NPM

To publish the production version of the static website to npmjs.com, do this:

```sh
npm run publish --packages=static --newversion=minor
```

Where it says `--newversion=`, reasonable options are `"major"`, `"minor"`, and `"patch"`.

**IMPORTANT:** _Do NOT do `npm publish` -- the word "run" above is important._