# Vendor Library

Adapter parsers and command catalogs were adapted from the locally supplied
OLT Provisioning Manager 2.0.0, at the application owner's request. This is not
a separate application: its database, authentication, configuration, updater,
notification workers and scheduler are not included.

The billing bridge permits read-only operations only. A command catalog or a
vendor name is not proof that a firmware supports an operation. Unverified
write operations remain locked; the existing verified CDATA path stays separate.

Background reads omit per-ONU enrichment and use a shared bounded time/request
budget. No defaults or credentials from the original installation are copied.
