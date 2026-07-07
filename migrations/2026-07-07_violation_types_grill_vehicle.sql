-- Add two lease-violation types to the security/community category.
-- Applied to production via MCP; idempotent for repo/migration history.
insert into violation_types (category, label, sort_order, active)
select 'security_community', 'Grill Violation', 90, true
where not exists (select 1 from violation_types where label = 'Grill Violation');

insert into violation_types (category, label, sort_order, active)
select 'security_community', 'Vehicle Operability', 100, true
where not exists (select 1 from violation_types where label = 'Vehicle Operability');
