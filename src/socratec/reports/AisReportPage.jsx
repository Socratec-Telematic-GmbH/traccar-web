import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  Table, TableBody, TableCell, TableHead, TableRow, Typography, Box, Chip, TextField, CircularProgress,
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import { useTranslation } from '../../common/components/LocalizationProvider';
import PageLayout from '../../common/components/PageLayout';
import ReportsMenu from '../../reports/components/ReportsMenu';
import { useCatch } from '../../reactHelper';
import useReportStyles from '../../reports/common/useReportStyles';
import TableShimmer from '../../common/components/TableShimmer';
import { formatTime } from '../../common/util/formatter';

const AisReportPage = () => {
  const { classes } = useReportStyles();
  const t = useTranslation();

  const devices = useSelector((state) => state.devices.items);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [carriers, setCarriers] = useState({});
  const [updatingCarriers, setUpdatingCarriers] = useState(new Set());
  const [validationErrors, setValidationErrors] = useState({});
  const [inputValues, setInputValues] = useState({});

  // Fetch devices and carriers on component mount
  const fetchData = useCatch(async () => {
    setLoading(true);
    try {
      // Fetch all devices (they should already be in the store, but we'll fetch fresh data)
      const devicesResponse = await fetch('/api/devices');
      if (devicesResponse.ok) {
        const devicesData = await devicesResponse.json();
        setItems(devicesData);
      } else {
        throw Error(await devicesResponse.text());
      }

      // Fetch carriers
      const carriersResponse = await fetch('/api/carriers');
      if (carriersResponse.ok) {
        const carriersData = await carriersResponse.json();
        // Create a map of deviceId -> carrier for easy lookup
        const carriersMap = {};
        carriersData.forEach(carrier => {
          carriersMap[carrier.id] = carrier;
        });
        setCarriers(carriersMap);
      } else {
        // If carriers endpoint fails, we'll just show devices without carrier info
        console.warn('Failed to fetch carriers:', await carriersResponse.text());
        setCarriers({});
      }
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    fetchData();
  }, []);

  const getDeviceStatus = (device) => {
    if (!device.lastUpdate) {
      return 'unknown';
    }
    
    const now = new Date();
    const lastUpdate = new Date(device.lastUpdate);
    const diffMinutes = (now - lastUpdate) / (1000 * 60);
    
    if (diffMinutes < 5) {
      return 'online';
    } else if (diffMinutes < 30) {
      return 'offline';
    } else {
      return 'unknown';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
        return 'success';
      case 'offline':
        return 'warning';
      case 'unknown':
      default:
        return 'default';
    }
  };

  const getCarrierTypeLabel = (type) => {
    switch (type) {
      case 0:
        return t('socratec_carrierTypeVessel');
      default:
        return t('socratec_carrierTypeUnknown');
    }
  };

  // Validate MMSI number (9-digit Maritime Mobile Service Identity)
  const validateMMSI = (mmsi) => {
    // MMSI must be exactly 9 digits
    const mmsiRegex = /^\d{9}$/;
    return mmsiRegex.test(mmsi);
  };

  // Handle real-time input validation
  const handleInputChange = (deviceId, value) => {
    // Update input value
    setInputValues(prev => ({
      ...prev,
      [deviceId]: value,
    }));

    // Validate in real-time
    if (value.trim() && !validateMMSI(value.trim())) {
      setValidationErrors(prev => ({
        ...prev,
        [deviceId]: t('socratec_invalidMMSI'),
      }));
    } else {
      // Clear validation error if input is valid or empty
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[deviceId];
        return newErrors;
      });
    }
  };

  // Handle carrier ID changes (create/update/delete)
  const handleCarrierIdChange = useCatch(async (deviceId, newCarrierId) => {
    const currentCarrier = carriers[deviceId];
    const trimmedCarrierId = newCarrierId.trim();
    
    // Clear any existing validation error for this device
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[deviceId];
      return newErrors;
    });
    
    // If the value hasn't actually changed, do nothing
    if (currentCarrier && currentCarrier.carrierId === trimmedCarrierId) {
      return;
    }
    
    // If empty and no current carrier, do nothing
    if (!trimmedCarrierId && !currentCarrier) {
      return;
    }

    // Validate MMSI if not empty
    if (trimmedCarrierId && !validateMMSI(trimmedCarrierId)) {
      const errorMessage = t('socratec_invalidMMSI');
      setValidationErrors(prev => ({
        ...prev,
        [deviceId]: errorMessage,
      }));
      throw Error(errorMessage);
    }

    setUpdatingCarriers(prev => new Set(prev).add(deviceId));
    
    try {
      if (!trimmedCarrierId && currentCarrier) {
        // Delete carrier
        const response = await fetch(`/api/carriers/${deviceId}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          setCarriers(prev => {
            const newCarriers = { ...prev };
            delete newCarriers[deviceId];
            return newCarriers;
          });
        } else {
          throw Error(await response.text());
        }
      } else if (trimmedCarrierId && !currentCarrier) {
        // Create new carrier
        const carrierData = {
          id: deviceId,
          carrierId: trimmedCarrierId,
          type: 0, // Default to vessel type
        };
        
        const response = await fetch('/api/carriers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(carrierData),
        });
        
        if (response.ok) {
          const createdCarrier = await response.json();
          setCarriers(prev => ({
            ...prev,
            [deviceId]: createdCarrier,
          }));
        } else {
          throw Error(await response.text());
        }
      } else if (trimmedCarrierId && currentCarrier) {
        // Update existing carrier
        const carrierData = {
          id: deviceId,
          carrierId: trimmedCarrierId,
          type: currentCarrier.type || 0, // Preserve existing type
        };
        
        const response = await fetch(`/api/carriers/${deviceId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(carrierData),
        });
        
        if (response.ok) {
          const updatedCarrier = await response.json();
          setCarriers(prev => ({
            ...prev,
            [deviceId]: updatedCarrier,
          }));
        } else {
          throw Error(await response.text());
        }
      }
    } finally {
      setUpdatingCarriers(prev => {
        const newSet = new Set(prev);
        newSet.delete(deviceId);
        return newSet;
      });
    }
  });

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'socratec_reportAis']}>
      <div className={classes.container}>
        <div className={classes.containerMain}>
          <div className={classes.header}>
            <Box sx={{ padding: 2 }}>
              <Typography variant="h6" gutterBottom>
                {t('socratec_reportAis')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('socratec_reportAisDescription')}
              </Typography>
            </Box>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('sharedName')}</TableCell>
                <TableCell>{t('deviceIdentifier')}</TableCell>
                <TableCell>{t('deviceStatus')}</TableCell>
                <TableCell>{t('deviceLastUpdate')}</TableCell>
                <TableCell>{t('socratec_carrierId')}</TableCell>
                <TableCell>{t('socratec_carrierType')}</TableCell>
                <TableCell>{t('socratec_carrierCreatedAt')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading ? items.map((device) => {
                const carrier = carriers[device.id];
                const status = getDeviceStatus(device);
                
                return (
                  <TableRow key={device.id}>
                    <TableCell>{device.name}</TableCell>
                    <TableCell>{device.uniqueId}</TableCell>
                    <TableCell>
                      <Chip
                        label={t(`deviceStatus${status.charAt(0).toUpperCase() + status.slice(1)}`)}
                        color={getStatusColor(status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {device.lastUpdate ? formatTime(device.lastUpdate, 'seconds') : '-'}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                          size="small"
                          placeholder={t('socratec_carrierIdPlaceholder')}
                          value={inputValues[device.id] !== undefined ? inputValues[device.id] : (carrier ? carrier.carrierId : '')}
                          disabled={updatingCarriers.has(device.id)}
                          error={Boolean(validationErrors[device.id])}
                          helperText={validationErrors[device.id]}
                          onChange={(e) => handleInputChange(device.id, e.target.value)}
                          onBlur={(e) => handleCarrierIdChange(device.id, e.target.value)}
                          sx={{ minWidth: 150 }}
                        />
                        {updatingCarriers.has(device.id) && (
                          <CircularProgress size={16} />
                        )}
                        {validationErrors[device.id] && (
                          <ErrorIcon color="error" fontSize="small" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {carrier ? getCarrierTypeLabel(carrier.type) : '-'}
                    </TableCell>
                    <TableCell>
                      {carrier && carrier.createdAt ? formatTime(carrier.createdAt, 'seconds') : '-'}
                    </TableCell>
                  </TableRow>
                );
              }) : (<TableShimmer columns={7} />)}
            </TableBody>
          </Table>
          {!loading && items.length === 0 && (
            <Box sx={{ padding: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t('sharedNoData')}
              </Typography>
            </Box>
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default AisReportPage;
