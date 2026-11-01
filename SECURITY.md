# Security and private deployment data

Recall is a single-user app intended for loopback or an authenticated private network. It has no application login. Anyone who can reach its API can view and change its questions and progress. Add authentication before making it publicly reachable. Keep PostgreSQL private.

Store deployment URLs, credentials, SSH material, real question banks, database exports, backup configuration and disk identifiers outside Git. Production settings belong in ignored files. Android asks for its server address on the device and does not embed it in source.

Run `npm run check:public` before sharing a branch. It checks tracked paths and text for common private-deployment material. Use a dedicated secret scanner over Git history as well; pattern checks cannot prove that every secret has been found. Never paste secrets into an issue or security report.

Report vulnerabilities privately through the repository's security reporting mechanism when available. For accidentally published credentials, revoke them first, then remove them from files and history. Rewriting a branch does not erase existing clones or all cached copies.
