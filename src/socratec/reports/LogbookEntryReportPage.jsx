import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton, Table, TableBody, TableCell, TableHead, TableRow,
  Select, MenuItem, CircularProgress, TextField, Typography, Box, Grid,
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
import scheduleReport from '../../reports/common/scheduleReport';

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
  ['notes', 'socratec_logbookEntryNotes'],
];
const columnsMap = new Map(columnsArray);

// Define mandatory columns that cannot be hidden
const mandatoryColumns = ['startTime', 'startAddress', 'endTime', 'endAddress', 'duration', 'distance', 'type', 'notes'];

// Filter optional columns (those that can be toggled by user)
const optionalColumnsArray = columnsArray.filter(([key]) => !mandatoryColumns.includes(key));

const LogbookEntryReportPage = () => {
  const navigate = useNavigate();
  const { classes } = useReportStyles();
  const t = useTranslation();

  const distanceUnit = useAttributePreference('distanceUnit');
  const speedUnit = useAttributePreference('speedUnit');
  const volumeUnit = useAttributePreference('volumeUnit');

  const [optionalColumns, setOptionalColumns] = usePersistedState('logbookEntryOptionalColumns', ['averageSpeed']);
  
  // Always include mandatory columns plus user-selected optional columns
  const columns = [...mandatoryColumns, ...optionalColumns];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [route, setRoute] = useState(null);
  const [updatingItems, setUpdatingItems] = useState(new Set());

  // Memoize statistics calculations to avoid recalculation on every render
  const statistics = useMemo(() => {
    const totalDistance = items.reduce((sum, item) => sum + (item.distance || 0), 0);
    const totalDuration = items.reduce((sum, item) => sum + (item.duration || 0), 0);
    const privateDistance = items.filter(item => item.type === 2).reduce((sum, item) => sum + (item.distance || 0), 0);
    const privateDuration = items.filter(item => item.type === 2).reduce((sum, item) => sum + (item.duration || 0), 0);
    const businessDistance = items.filter(item => item.type === 1).reduce((sum, item) => sum + (item.distance || 0), 0);
    const businessDuration = items.filter(item => item.type === 1).reduce((sum, item) => sum + (item.duration || 0), 0);
    
    return {
      totalDistance,
      totalDuration,
      privateDistance,
      privateDuration,
      businessDistance,
      businessDuration,
    };
  }, [items]);

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

  const handleSubmit = useCatch(async ({ deviceIds, groupIds, from, to, type }) => {
    const query = new URLSearchParams({ from, to });
    
    // Add deviceIds if provided
    if (deviceIds && deviceIds.length > 0) {
      deviceIds.forEach(deviceId => query.append('deviceId', deviceId));
    }
    
    // Add groupIds if provided
    if (groupIds && groupIds.length > 0) {
      groupIds.forEach(groupId => query.append('groupId', groupId));
    }

    if (type === 'export') {
      window.location.assign(`/api/reports/logbook/xlsx?${query.toString()}`);
    } else if (type === 'pdf') {
      window.location.assign(`/api/reports/logbook/pdf?${query.toString()}`);
    } else if (type === 'mail') {
      const response = await fetch(`/api/reports/logbook/mail?${query.toString()}`);
      if (!response.ok) {
        throw Error(await response.text());
      }
    } else {
      setLoading(true);
      try {
        const response = await fetch(`/api/reports/logbook?${query.toString()}`, {
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
    }
  });

  const handleSchedule = useCatch(async (deviceIds, groupIds, report) => {
    report.type = 'logbook';
    const error = await scheduleReport(deviceIds, groupIds, report);
    if (error) {
      throw Error(error);
    } else {
      navigate('/reports/scheduled');
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
        let errorMessage = 'Failed to update logbook entry type';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = await response.text() || errorMessage;
        }
        
        // Provide specific error messages based on status codes
        if (response.status === 400) {
          errorMessage = 'Invalid type value. Please try again.';
        } else if (response.status === 404) {
          errorMessage = 'Logbook entry not found.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. You do not have permission to modify this entry.';
        }
        
        throw Error(errorMessage);
      }
    } finally {
      setUpdatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  });

  const handleNotesUpdate = useCatch(async (itemId, newNotes) => {
    setUpdatingItems(prev => new Set(prev).add(itemId));
    
    try {
      const currentItem = items.find(item => item.id === itemId);
      const response = await fetch(`/api/logbook/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ 
          type: currentItem.type, 
          notes: newNotes,
          id: itemId 
        }),
      });
      
      if (response.ok) {
        const updatedItem = await response.json();
        setItems(prevItems => 
          prevItems.map(item => 
            item.id === itemId ? updatedItem : item
          )
        );
      } else {
        let errorMessage = 'Failed to update logbook entry notes';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = await response.text() || errorMessage;
        }
        
        // Provide specific error messages based on status codes
        if (response.status === 400) {
          errorMessage = 'Invalid notes value. Please try again.';
        } else if (response.status === 404) {
          errorMessage = 'Logbook entry not found.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. You do not have permission to modify this entry.';
        }
        
        throw Error(errorMessage);
      }
    } finally {
      setUpdatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  });

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
            <MenuItem value={1}>{t('socratec_logbookTypeBusiness')}</MenuItem>
            <MenuItem value={2}>{t('socratec_logbookTypePrivate')}</MenuItem>
          </Select>
        );
      case 'notes':
        return (
          <TextField
            defaultValue={value || ''}
            onBlur={(e) => {
              // Only update if the value actually changed
              if (e.target.value !== (value || '')) {
                handleNotesUpdate(item.id, e.target.value);
              }
            }}
            size="small"
            disabled={updatingItems.has(item.id)}
            placeholder={t('socratec_logbookEntryNotesPlaceholder') || 'Add notes...'}
            sx={{ minWidth: 200 }}
            multiline
            maxRows={3}
          />
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
            <ReportFilter 
              handleSubmit={handleSubmit} 
              handleSchedule={handleSchedule} 
              loading={loading}
              customOptions={{
                json: t('reportShow'),
                export: t('reportExport'),
                pdf: t('socratec_exportPdf'),
                mail: t('reportEmail'),
                schedule: t('reportSchedule'),
              }}
            >
              <ColumnSelect columns={optionalColumns} setColumns={setOptionalColumns} columnsArray={optionalColumnsArray} />
            </ReportFilter>
          </div>
            <Box
              sx={{
                padding: 2,
                backgroundColor: 'background.paper',
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      <strong>{t('socratec_logbookEntriesCount')}:</strong> {items.length}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      <strong>{t('socratec_logbookTotalDistance')}:</strong> {formatDistance(
                        statistics.totalDistance,
                        distanceUnit,
                        t
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>{t('socratec_logbookPrivateDistance')}:</strong> {formatDistance(
                        statistics.privateDistance,
                        distanceUnit,
                        t
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>{t('socratec_logbookBusinessDistance')}:</strong> {formatDistance(
                        statistics.businessDistance,
                        distanceUnit,
                        t
                      )}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      <strong>{t('socratec_logbookTotalDuration')}:</strong> {formatNumericHours(
                        statistics.totalDuration,
                        t
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>{t('socratec_logbookPrivateDuration')}:</strong> {formatNumericHours(
                        statistics.privateDuration,
                        t
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>{t('socratec_logbookBusinessDuration')}:</strong> {formatNumericHours(
                        statistics.businessDuration,
                        t
                      )}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Box>
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
                      {(key === 'type' || key === 'notes') && updatingItems.has(item.id) ? (
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
