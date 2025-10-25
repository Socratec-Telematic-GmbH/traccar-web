import { useState } from 'react';
import {
  IconButton, Table, TableBody, TableCell, TableHead, TableRow,
  Select, MenuItem, CircularProgress,
} from '@mui/material';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import LocationSearchingIcon from '@mui/icons-material/LocationSearching';
import {
  formatDistance, formatSpeed, formatVolume, formatTime, formatNumericHours,
} from '../../common/util/formatter';
import ReportFilter from '../../reports/components/ReportFilter';
import { useAttributePreference } from '../../common/util/preferences';
import { useTranslation } from '../../common/components/LocalizationProvider';
import PageLayout from '../../common/components/PageLayout';
import ReportsMenu from '../../reports/components/ReportsMenu';
import ColumnSelect from '../../reports/components/ColumnSelect';
import usePersistedState from '../../common/util/usePersistedState';
import { useCatch, useEffectAsync } from '../../reactHelper';
import useReportStyles from '../../reports/common/useReportStyles';
import MapView from '../../map/core/MapView';
import MapRoutePath from '../../map/MapRoutePath';
import AddressValue from '../../common/components/AddressValue';
import TableShimmer from '../../common/components/TableShimmer';
import MapMarkers from '../../map/MapMarkers';
import MapCamera from '../../map/MapCamera';
import MapGeofence from '../../map/MapGeofence';
import MapScale from '../../map/MapScale';

const columnsArray = [
  ['startTime', 'reportStartTime'],
  ['startOdometer', 'reportStartOdometer'],
  ['startAddress', 'reportStartAddress'],
  ['endTime', 'reportEndTime'],
  ['endOdometer', 'reportEndOdometer'],
  ['endAddress', 'reportEndAddress'],
  ['distance', 'sharedDistance'],
  ['averageSpeed', 'reportAverageSpeed'],
  ['maxSpeed', 'reportMaximumSpeed'],
  ['duration', 'reportDuration'],
  ['spentFuel', 'reportSpentFuel'],
  ['driverName', 'sharedDriver'],
  ['type', 'socratec_logbookEntryType'],
];
const columnsMap = new Map(columnsArray);

const LogbookEntryReportPage = () => {
  const { classes } = useReportStyles();
  const t = useTranslation();

  const distanceUnit = useAttributePreference('distanceUnit');
  const speedUnit = useAttributePreference('speedUnit');
  const volumeUnit = useAttributePreference('volumeUnit');

  const [columns, setColumns] = usePersistedState('logbookEntryColumns', ['startTime', 'endTime', 'distance', 'averageSpeed', 'type']);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [route, setRoute] = useState(null);
  const [updatingItems, setUpdatingItems] = useState(new Set());

  const createMarkers = () => ([
    {
      latitude: selectedItem.startLat,
      longitude: selectedItem.startLon,
      image: 'start-success',
    },
    {
      latitude: selectedItem.endLat,
      longitude: selectedItem.endLon,
      image: 'finish-error',
    },
  ]);

  useEffectAsync(async () => {
    if (selectedItem) {
      const query = new URLSearchParams({
        deviceId: selectedItem.deviceId,
        from: selectedItem.startTime,
        to: selectedItem.endTime,
      });
      const response = await fetch(`/api/reports/route?${query.toString()}`, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (response.ok) {
        setRoute(await response.json());
      } else {
        throw Error(await response.text());
      }
    } else {
      setRoute(null);
    }
  }, [selectedItem]);

  const handleSubmit = useCatch(async ({ deviceIds, groupIds, from, to }) => {
    const query = new URLSearchParams({ from, to });
    
    // Add deviceIds if provided
    if (deviceIds && deviceIds.length > 0) {
      deviceIds.forEach(deviceId => query.append('deviceId', deviceId));
    }
    
    // Add groupIds if provided
    if (groupIds && groupIds.length > 0) {
      groupIds.forEach(groupId => query.append('groupId', groupId));
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/logbook/report?${query.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        setItems(await response.json());
      } else {
        throw Error(await response.text());
      }
    } finally {
      setLoading(false);
    }
  });

  const handleTypeUpdate = useCatch(async (itemId, newType) => {
    setUpdatingItems(prev => new Set(prev).add(itemId));
    
    try {
      const response = await fetch(`/api/logbook/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ type: newType, id: itemId }),
      });
      
      if (response.ok) {
        const updatedItem = await response.json();
        setItems(prevItems => 
          prevItems.map(item => 
            item.id === itemId ? updatedItem : item
          )
        );
      } else {
        throw Error(await response.text());
      }
    } finally {
      setUpdatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  });

  const formatLogbookEntryType = (type) => {
    switch (type) {
      case 1:
        return t('socratec_logbookTypeBusiness');
      case 2:
        return t('socratec_logbookTypePrivate');
      case 0:
      default:
        return t('socratec_logbookTypeNone');
    }
  };

  const formatValue = (item, key) => {
    const value = item[key];
    switch (key) {
      case 'startTime':
      case 'endTime':
        return formatTime(value, 'minutes');
      case 'startOdometer':
      case 'endOdometer':
      case 'distance':
        return formatDistance(value, distanceUnit, t);
      case 'averageSpeed':
      case 'maxSpeed':
        return value > 0 ? formatSpeed(value, speedUnit, t) : null;
      case 'duration':
        return formatNumericHours(value, t);
      case 'spentFuel':
        return value > 0 ? formatVolume(value, volumeUnit, t) : null;
      case 'startAddress':
        return (<AddressValue latitude={item.startLat} longitude={item.startLon} originalAddress={value} />);
      case 'endAddress':
        return (<AddressValue latitude={item.endLat} longitude={item.endLon} originalAddress={value} />);
      case 'driverName':
        // Note: The API provides driverId, but we might need to resolve driver names separately
        // For now, we'll show the driverId if available
        return item.driverId || null;
      case 'type':
        return (
          <Select
            value={value}
            onChange={(e) => handleTypeUpdate(item.id, e.target.value)}
            size="small"
            disabled={updatingItems.has(item.id)}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value={0}>{t('socratec_logbookTypeNone')}</MenuItem>
            <MenuItem value={1}>{t('socratec_logbookTypeBusiness')}</MenuItem>
            <MenuItem value={2}>{t('socratec_logbookTypePrivate')}</MenuItem>
          </Select>
        );
      default:
        return value;
    }
  };

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'socratec_reportLogbookEntries']}>
      <div className={classes.container}>
        {selectedItem && (
          <div className={classes.containerMap}>
            <MapView>
              <MapGeofence />
              {route && (
                <>
                  <MapRoutePath positions={route} />
                  <MapMarkers markers={createMarkers()} />
                  <MapCamera positions={route} />
                </>
              )}
            </MapView>
            <MapScale />
          </div>
        )}
        <div className={classes.containerMain}>
          <div className={classes.header}>
            <ReportFilter handleSubmit={handleSubmit} loading={loading}>
              <ColumnSelect columns={columns} setColumns={setColumns} columnsArray={columnsArray} />
            </ReportFilter>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell className={classes.columnAction} />
                {columns.map((key) => (<TableCell key={key}>{t(columnsMap.get(key))}</TableCell>))}
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading ? items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className={classes.columnAction} padding="none">
                    {selectedItem === item ? (
                      <IconButton size="small" onClick={() => setSelectedItem(null)}>
                        <GpsFixedIcon fontSize="small" />
                      </IconButton>
                    ) : (
                      <IconButton size="small" onClick={() => setSelectedItem(item)}>
                        <LocationSearchingIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                  {columns.map((key) => (
                    <TableCell key={key}>
                      {key === 'type' && updatingItems.has(item.id) ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {formatValue(item, key)}
                          <CircularProgress size={16} />
                        </div>
                      ) : (
                        formatValue(item, key)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              )) : (<TableShimmer columns={columns.length + 1} startAction />)}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageLayout>
  );
};

export default LogbookEntryReportPage;
