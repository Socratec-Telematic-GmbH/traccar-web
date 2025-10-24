import { useTranslation } from '../../common/components/LocalizationProvider';
import PageLayout from '../../common/components/PageLayout';
import ReportsMenu from '../../reports/components/ReportsMenu';

const TripsLogbookPage = () => {
  const t = useTranslation();

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'socratec_reportTripsLogbook']}>
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>Hello World</h1>
        <p>This is the Trips Logbook page - coming soon!</p>
      </div>
    </PageLayout>
  );
};

export default TripsLogbookPage;
