import React, { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Sparkline from '../components/charts/Sparkline';
import { ArrowUpRight, ArrowDownRight, DollarSign, Percent, Calendar, Loader2, Bot } from 'lucide-react';
import { SparklineData } from '../types';
import { GoogleGenAI } from '@google/genai';

// Mock data for dashboard
const summaryData = {
  totalValue: 125680.45,
  dayChange: 734.21,
  dayChangePercent: 0.59,
  ytdReturn: 12.3,
  upcomingDividends: 245.50,
};

const mockWatchlist: { symbol: string, name: string, price: number, change: number, data: SparklineData[] }[] = [
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 184.88, change: -2.31, data: [{date: '1', value: 180}, {date: '2', value: 182}, {date: '3', value: 181}, {date: '4', value: 185}] },
    { symbol: 'DIS', name: 'Walt Disney Co', price: 102.50, change: 1.15, data: [{date: '1', value: 100}, {date: '2', value: 101}, {date: '3', value: 103}, {date: '4', value: 102}] },
    { symbol: 'JPM', name: 'JPMorgan Chase', price: 198.70, change: 0.98, data: [{date: '1', value: 195}, {date: '2', value: 196}, {date: '3', value: 197}, {date: '4', value: 199}] },
    { symbol: 'V', name: 'Visa Inc.', price: 275.40, change: -0.50, data: [{date: '1', value: 278}, {date: '2', value: 277}, {date: '3', value: 276}, {date: '4', value: 275}] },
];

const SummaryCard = ({ title, value, change, icon: Icon, isCurrency = true }: { title: string; value: number; change?: number; icon: React.ElementType; isCurrency?: boolean }) => {
    const isPositive = change === undefined || change >= 0;
    return (
        <Card>
            <div className="flex items-center justify-between">
                <p className="text-text-secondary">{title}</p>
                <Icon className="w-5 h-5 text-text-secondary" />
            </div>
            <p className="text-3xl font-bold mt-2">{isCurrency ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : `${value}%`}</p>
            {change !== undefined && (
                <div className={`flex items-center mt-1 text-sm ${isPositive ? 'text-success' : 'text-danger'}`}>
                    {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    <span className="ml-1 font-semibold">{isCurrency ? Math.abs(change).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : `${Math.abs(change)}%`}</span>
                </div>
            )}
        </Card>
    );
};

// Function to render markdown-like content safely
const renderGeneratedContent = (content: string) => {
    const htmlContent = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*/g, '') // Remove asterisks that are not part of bolding
      .replace(/(\r\n|\n|\r)/gm, "<br />"); // Newlines
    return { __html: htmlContent };
};

const DashboardPage: React.FC = () => {
    const [newsSummary, setNewsSummary] = useState('');
    const [isGeneratingNews, setIsGeneratingNews] = useState(false);
    const [newsError, setNewsError] = useState<string | null>(null);

    const generateNewsSummary = async () => {
        setIsGeneratingNews(true);
        setNewsError(null);
        setNewsSummary('');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const prompt = "Provide a brief summary of the most important financial market news from the last 24 hours. Format it as a list of 3-4 key headlines with a one-sentence summary for each. Use markdown for bolding the headlines (e.g., **Headline:** Summary).";
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            setNewsSummary(response.text);

        } catch (error) {
            console.error("Error generating news summary:", error);
            setNewsError("Sorry, I couldn't fetch the latest news summary. Please try again later.");
        } finally {
            setIsGeneratingNews(false);
        }
    };


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard title="Portfolio Value" value={summaryData.totalValue} change={summaryData.dayChange} icon={DollarSign} />
        <SummaryCard title="1-Day Change" value={summaryData.dayChangePercent} isCurrency={false} icon={Percent} />
        <SummaryCard title="YTD Return" value={summaryData.ytdReturn} isCurrency={false} icon={Percent} />
        <SummaryCard title="Upcoming Dividends (30d)" value={summaryData.upcomingDividends} icon={Calendar} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Watchlist */}
        <Card className="lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Watchlist</h2>
            <Button variant="secondary" size="sm">Add Ticker</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-accent">
                  <th className="p-3">Ticker</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Change</th>
                  <th className="p-3 hidden sm:table-cell">Chart (7d)</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {mockWatchlist.map(item => (
                  <tr key={item.symbol} className="border-b border-accent last:border-0 hover:bg-accent/50">
                    <td className="p-3">
                        <div className="font-bold">{item.symbol}</div>
                        <div className="text-xs text-text-secondary truncate">{item.name}</div>
                    </td>
                    <td className="p-3 font-mono">${item.price.toFixed(2)}</td>
                    <td className={`p-3 font-mono ${item.change >= 0 ? 'text-success' : 'text-danger'}`}>{item.change.toFixed(2)}</td>
                    <td className="p-3 hidden sm:table-cell"><Sparkline data={item.data} /></td>
                    <td className="p-3 text-right"><Button variant="primary" size="sm">Add</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent News */}
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent News</h2>
            <Button 
                variant="secondary" 
                size="sm" 
                onClick={generateNewsSummary}
                disabled={isGeneratingNews}
                aria-label="Generate news summary"
            >
                {isGeneratingNews ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                    <Bot className="w-4 h-4 mr-2" />
                )}
                Generate
            </Button>
          </div>
          <div className="space-y-4 text-sm min-h-[150px]">
            {isGeneratingNews && (
              <div className="flex flex-col items-center justify-center h-full text-text-secondary" aria-live="polite">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p>Generating news summary...</p>
              </div>
            )}
            {newsError && (
              <div className="p-3 bg-danger/20 text-danger rounded-md" role="alert">
                {newsError}
              </div>
            )}
            {newsSummary && (
                <div 
                    className="text-text-secondary space-y-2"
                    dangerouslySetInnerHTML={renderGeneratedContent(newsSummary)}
                />
            )}
            {!isGeneratingNews && !newsSummary && !newsError && (
                <div className="flex flex-col items-center justify-center h-full text-text-secondary text-center">
                    <p>Click "Generate" to get an AI-powered summary of recent financial news.</p>
                </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;