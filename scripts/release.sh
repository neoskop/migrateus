#!/bin/bash
set -e
npm version --no-git-tag-version $1
npm run gv
npm run build
npm publish
git add -A
git commit -m "Release $1"
git tag $1
git push
git push --tags
