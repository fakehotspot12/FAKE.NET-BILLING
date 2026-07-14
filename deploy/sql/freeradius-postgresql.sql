create table if not exists nas (
  id serial primary key,
  nasname inet not null,
  shortname varchar(32) not null,
  type varchar(30) default 'other',
  ports integer,
  secret varchar(60) not null,
  server varchar(64),
  community varchar(50),
  description varchar(200)
);

create unique index if not exists nas_nasname_idx on nas (nasname);

create table if not exists radcheck (
  id serial primary key,
  username varchar(64) not null default '',
  attribute varchar(64) not null default '',
  op char(2) not null default '==',
  value varchar(253) not null default ''
);

create index if not exists radcheck_username_idx on radcheck (username, attribute);

create table if not exists radreply (
  id serial primary key,
  username varchar(64) not null default '',
  attribute varchar(64) not null default '',
  op char(2) not null default '=',
  value varchar(253) not null default ''
);

create index if not exists radreply_username_idx on radreply (username, attribute);

create table if not exists radgroupcheck (
  id serial primary key,
  groupname varchar(64) not null default '',
  attribute varchar(64) not null default '',
  op char(2) not null default '==',
  value varchar(253) not null default ''
);

create index if not exists radgroupcheck_groupname_idx on radgroupcheck (groupname, attribute);

create table if not exists radgroupreply (
  id serial primary key,
  groupname varchar(64) not null default '',
  attribute varchar(64) not null default '',
  op char(2) not null default '=',
  value varchar(253) not null default ''
);

create index if not exists radgroupreply_groupname_idx on radgroupreply (groupname, attribute);

create table if not exists radusergroup (
  id serial primary key,
  username varchar(64) not null default '',
  groupname varchar(64) not null default '',
  priority integer not null default 1
);

create index if not exists radusergroup_username_idx on radusergroup (username);

create table if not exists radacct (
  radacctid bigserial primary key,
  acctsessionid varchar(64) not null default '',
  acctuniqueid varchar(64) not null default '',
  username varchar(64) not null default '',
  groupname varchar(64),
  realm varchar(64),
  nasipaddress inet not null,
  nasportid varchar(32),
  nasporttype varchar(32),
  acctstarttime timestamptz,
  acctupdatetime timestamptz,
  acctstoptime timestamptz,
  acctinterval bigint,
  acctsessiontime bigint,
  acctauthentic varchar(32),
  connectinfo_start varchar(50),
  connectinfo_stop varchar(50),
  acctinputoctets bigint,
  acctoutputoctets bigint,
  calledstationid varchar(50),
  callingstationid varchar(50),
  acctterminatecause varchar(32),
  servicetype varchar(32),
  framedprotocol varchar(32),
  framedipaddress inet,
  framedipv6address inet,
  framedipv6prefix inet,
  framedinterfaceid varchar(44),
  delegatedipv6prefix inet,
  class varchar(64),
  acctinputgigawords bigint not null default 0,
  acctoutputgigawords bigint not null default 0
);

create unique index if not exists radacct_acctuniqueid_idx on radacct (acctuniqueid);
create index if not exists radacct_username_idx on radacct (username);
create index if not exists radacct_active_idx on radacct (acctstoptime) where acctstoptime is null;
create index if not exists radacct_start_idx on radacct (acctstarttime);

create table if not exists radpostauth (
  id bigserial primary key,
  username varchar(64) not null default '',
  pass varchar(128) not null default '',
  reply varchar(32) not null default '',
  authdate timestamptz not null default now()
);

create index if not exists radpostauth_username_idx on radpostauth (username);
create index if not exists radpostauth_authdate_idx on radpostauth (authdate);
