import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { useTranslation } from '../../common/components/LocalizationProvider';
import PageLayout from '../../common/components/PageLayout';
import ReportsMenu from '../../reports/components/ReportsMenu';
import { useCatch } from '../../reactHelper';
import useReportStyles from '../../reports/common/useReportStyles';
import TableShimmer from '../../common/components/TableShimmer';
import ReportFilter from '../../reports/components/ReportFilter';
import scheduleReport from '../../reports/common/scheduleReport';

const columnsArray = [
  ['deviceName', 'reportDeviceName'],
  ['geofenceName', 'sharedGeofence'],
  ['visitCount', 'socratec_geofenceVisitCount'],
];
const columnsMap = new Map(columnsArray);

const GeofenceVisitsReportPage = () => {
  const navigate = useNavigate();
  const { classes } = useReportStyles();
  const t = useTranslation();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const columns = columnsArray.map(([key]) => key);

  const handleSubmit = useCatch(async ({ deviceId, from, to, type }) => {
    const query = new URLSearchParams({ deviceId, from, to });

    if (type === 'export') {
      window.location.assign(`/api/reports/geofence-visits/xlsx?${query.toString()}`);
    } else if (type === 'mail') {
      const response = await fetch(`/api/reports/geofence-visits/mail?${query.toString()}`);
      if (!response.ok) {
        throw Error(await response.text());
      }
    } else {
      setLoading(true);
      try {
        const response = await fetch(`/api/reports/geofence-visits?${query.toString()}`, {
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
    report.type = 'geofence-visits';
    const error = await scheduleReport(deviceIds, groupIds, report);
    if (error) {
      throw Error(error);
    } else {
      navigate('/reports/scheduled');
    }
  });

  const formatValue = (item, key) => {
    const value = item[key];
    switch (key) {
      case 'deviceName':
      case 'geofenceName':
        return value || '';
      case 'visitCount':
        return value || 0;
      default:
        return value;
    }
  };

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'socratec_reportGeofenceVisits']}>
      <div className={classes.container}>
        <div className={classes.containerMain}>
          <div className={classes.header}>
            <ReportFilter handleSubmit={handleSubmit} handleSchedule={handleSchedule} loading={loading} />
          </div>
          <Table>
            <TableHead>
              <TableRow>
                {columns.map((key) => (<TableCell key={key}>{t(columnsMap.get(key))}</TableCell>))}
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading ? items.map((item, index) => (
                <TableRow key={`${item.deviceId}-${item.geofenceId}-${index}`}>
                  {columns.map((key) => (
                    <TableCell key={key}>
                      {formatValue(item, key)}
                    </TableCell>
                  ))}
                </TableRow>
              )) : (<TableShimmer columns={columns.length} />)}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageLayout>
  );
};

export default GeofenceVisitsReportPage;
