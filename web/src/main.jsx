import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = import.meta.env.VITE_API_BASE_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "https://pulse-price-tracker-service.onrender.com");
const request = async (path, options) => { const response = await fetch(`${API}${path}`, options); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Request failed"); return body; };
const money = value => value == null ? "Waiting for first scrape" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const dateTime = value => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function Sparkline({ history }) {
  if (history.length < 2) return <p className="muted">The first successful scrape will start the price chart.</p>;
  const prices = history.map(row => Number(row.price)); const min = Math.min(...prices); const max = Math.max(...prices); const span = max - min || 1;
  const points = prices.map((price, index) => `${(index / (prices.length - 1)) * 100},${90 - ((price - min) / span) * 75}`).join(" ");
  return <div><svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Price history"><polyline points={points} /></svg><div className="chart-labels"><span>{money(min)}</span><span>{money(max)}</span></div></div>;
}

function ProductDetail({ selected, onBack }) {
  const [detail, setDetail] = useState(null); const [error, setError] = useState("");
  useEffect(() => { request(`/api/products/${selected.id}`).then(setDetail).catch(e => setError(e.message)); }, [selected.id]);
  if (error) return <section className="panel"><button className="link" onClick={onBack}>← Back</button><p className="error">{error}</p></section>;
  if (!detail) return <section className="panel">Loading history…</section>;
  const { product, history, logs } = detail;
  return <section className="detail"><button className="link" onClick={onBack}>← All tracked products</button><h2>{product.name}</h2><p className="muted">{product.brand} · {product.category} · {product.sku}</p><div className="panel"><h3>Price history</h3><Sparkline history={history} /><table><thead><tr><th>Captured</th><th>Price</th><th>Stock</th></tr></thead><tbody>{history.slice().reverse().map(row => <tr key={row.id}><td>{dateTime(row.scraped_at)}</td><td>{money(row.price)}</td><td>{row.stock === 0 ? "Out of stock" : `${row.stock} left`}</td></tr>)}</tbody></table></div><div className="panel"><h3>Scrape log</h3><table><thead><tr><th>Time</th><th>Outcome</th><th>Detail</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td>{dateTime(log.created_at)}</td><td><span className={`status ${log.status}`}>{log.status}</span></td><td>{log.message}</td></tr>)}</tbody></table></div></section>;
}

function App() {
  const [products, setProducts] = useState([]); const [query, setQuery] = useState(""); const [matches, setMatches] = useState([]); const [message, setMessage] = useState(""); const [selected, setSelected] = useState(null);
  const load = () => request("/api/products").then(setProducts).catch(e => setMessage(e.message));
  useEffect(load, []);
  useEffect(() => { if (query.trim().length < 2) return setMatches([]); const timer = setTimeout(() => request(`/api/catalog/search?q=${encodeURIComponent(query)}`).then(setMatches).catch(e => setMessage(e.message)), 300); return () => clearTimeout(timer); }, [query]);
  const track = async catalogId => { try { await request("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalogId }) }); setQuery(""); setMatches([]); setMessage("Product added. Its first price will appear after the next scheduled scrape."); load(); } catch (e) { setMessage(e.message); } };
  const trackedIds = useMemo(() => new Set(products.map(p => p.catalog_id)), [products]);
  if (selected) return <main><header><div className="logo">pulse<span>.</span></div><p>Reliable price checks, with an honest audit trail.</p></header><ProductDetail selected={selected} onBack={() => setSelected(null)} /></main>;
  return <main><header><div className="logo">pulse<span>.</span></div><p>Reliable price checks, with an honest audit trail.</p></header><section className="hero"><div><h1>Watch the price,<br/>not the page.</h1><p>Track products from the INE demo store. Every attempt is recorded, including the ones that fail.</p></div><div className="search"><label htmlFor="search">Find a product to track</label><input id="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try “headphones” or a full product name"/><div className="results">{matches.map(item => <div className="result" key={item.id}><div><strong>{item.name}</strong><small>{item.brand} · {item.category}</small></div><button disabled={trackedIds.has(item.id)} onClick={() => track(item.id)}>{trackedIds.has(item.id) ? "Tracking" : "Track"}</button></div>)}</div></div></section>{message && <p className="notice">{message}</p>}<section><div className="section-heading"><h2>Tracked products</h2><span>Scrapes run every 2 hours</span></div><div className="cards">{products.map(product => <button className="card" key={product.id} onClick={() => setSelected(product)}><div className="card-top"><span>{product.category}</span><span className={product.latest?.stock === 0 ? "out" : "in"}>{product.latest ? (product.latest.stock ? `${product.latest.stock} left` : "Out of stock") : "Pending"}</span></div><h3>{product.name}</h3><p>{product.brand} · {product.sku}</p><strong>{money(product.latest?.price)}</strong>{product.latest && <small>Last checked {dateTime(product.latest.scraped_at)}</small>}</button>)}{!products.length && <div className="empty">Search the INE store above to choose the first product.</div>}</div></section></main>;
}
createRoot(document.getElementById("root")).render(<App />);
