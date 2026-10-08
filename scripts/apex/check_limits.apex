Map<String, System.OrgLimit> limitsMap = OrgLimits.getMap();
for (String key : limitsMap.keySet()) {
    if (key.toLowerCase().contains('api') || key.toLowerCase().contains('ai') || key.toLowerCase().contains('gen')) {
        System.OrgLimit l = limitsMap.get(key);
        System.debug('LIMIT: ' + key + ' => ' + l.getValue() + ' / ' + l.getLimit());
    }
}
