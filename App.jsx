import FinancialInput from './components/FinancialInput';

export default function App() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Financial Metrics Input</h1>

      {/* ตัวอย่าง input field สำหรับ metric หนึ่ง */}
      <FinancialInput 
        stock_id="391823e0-f895-4770-a22d-7593dc7ece78"
        metric_id="6a3d61b7-2968-4897-9a20-97442d466dc9"
        period_id="9950c212-3032-447b-a109-f8a912a7481a"
        subset_id={null}
      />

      {/* สามารถเพิ่มอีกหลาย metric ได้ */}
      <FinancialInput 
        stock_id="552d1926-13fd-4d71-a393-42cf15e8d9fd"
        metric_id="ca90bfd5-e1f4-47e5-8f38-9fc3f5bc41e8"
        period_id="28d76e8e-aca8-472b-96d4-219b6dd1126f"
        subset_id={null}
      />
    </div>
  );
}
