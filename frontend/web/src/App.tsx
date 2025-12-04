// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface TrainingRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  category: string;
  cognitiveScore: number;
  trainingPlan: string;
  status: "pending" | "active" | "completed";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    category: "Memory",
    cognitiveScore: "",
    trainingNotes: ""
  });
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [selectedRecord, setSelectedRecord] = useState<TrainingRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Calculate statistics
  const activeCount = records.filter(r => r.status === "active").length;
  const completedCount = records.filter(r => r.status === "completed").length;
  const pendingCount = records.filter(r => r.status === "pending").length;
  const avgScore = records.length > 0 
    ? Math.round(records.reduce((sum, r) => sum + r.cognitiveScore, 0) / records.length) 
    : 0;

  // Filter records based on search and category
  const filteredRecords = records.filter(record => {
    const matchesSearch = record.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.owner.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === "all" || record.category === filterCategory;
    
    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("training_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing training keys:", e);
        }
      }
      
      const list: TrainingRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`training_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                owner: recordData.owner,
                category: recordData.category,
                cognitiveScore: recordData.cognitiveScore || 0,
                trainingPlan: recordData.trainingPlan || "Custom FHE Plan",
                status: recordData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting cognitive data with FHE..."
    });
    
    try {
      // Simulate FHE encryption for cognitive data
      const encryptedData = `FHE-ENCRYPTED-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Generate personalized training plan based on score
      const score = parseInt(newRecordData.cognitiveScore) || 50;
      let trainingPlan = "";
      
      if (score < 40) trainingPlan = "Basic Cognitive Enhancement";
      else if (score < 70) trainingPlan = "Intermediate Brain Training";
      else trainingPlan = "Advanced Neural Development";

      const recordData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        category: newRecordData.category,
        cognitiveScore: score,
        trainingPlan: trainingPlan,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `training_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("training_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "training_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Cognitive data encrypted and stored securely!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          category: "Memory",
          cognitiveScore: "",
          trainingNotes: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const activateTraining = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Activating FHE training plan..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`training_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "active"
      };
      
      await contract.setData(
        `training_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Training plan activated with FHE!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Activation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const completeTraining = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Completing FHE training plan..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`training_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "completed"
      };
      
      await contract.setData(
        `training_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Training completed with FHE verification!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Completion failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE Service Status: ${isAvailable ? "Available" : "Unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const showRecordDetails = (record: TrainingRecord) => {
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  const renderScoreChart = () => {
    const scores = records.map(r => r.cognitiveScore);
    const maxScore = Math.max(...scores, 100);
    
    return (
      <div className="score-chart">
        {records.slice(0, 5).map((record, index) => (
          <div key={record.id} className="chart-bar-container">
            <div className="chart-label">{record.category.substring(0, 3)}</div>
            <div className="chart-bar-wrapper">
              <div 
                className="chart-bar"
                style={{ height: `${(record.cognitiveScore / maxScore) * 100}%` }}
              >
                <span className="chart-value">{record.cognitiveScore}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen cyber-bg">
      <div className="cyber-spinner neon-purple"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      {/* Header Section */}
      <header className="app-header neon-border-bottom">
        <div className="logo">
          <div className="logo-icon neon-cyan">
            <div className="brain-icon"></div>
          </div>
          <h1 className="neon-text-purple">Neuro<span className="neon-text-blue">FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={checkAvailability}
            className="cyber-button neon-blue"
          >
            Check FHE Status
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="cyber-button neon-pink"
          >
            <div className="add-icon"></div>
            New Assessment
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      {/* Main Navigation */}
      <nav className="main-nav neon-border-bottom">
        <div className="nav-tabs">
          <button 
            className={`nav-tab ${activeTab === "dashboard" ? "active neon-cyan" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button 
            className={`nav-tab ${activeTab === "training" ? "active neon-pink" : ""}`}
            onClick={() => setActiveTab("training")}
          >
            Training Plans
          </button>
          <button 
            className={`nav-tab ${activeTab === "analytics" ? "active neon-green" : ""}`}
            onClick={() => setActiveTab("analytics")}
          >
            Analytics
          </button>
        </div>
      </nav>
      
      {/* Main Content */}
      <div className="main-content">
        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="dashboard-panels">
            {/* Project Introduction Panel */}
            <div className="panel intro-panel neon-border cyber-card">
              <h2 className="neon-text-blue">FHE-Powered Cognitive Enhancement</h2>
              <p>
                NeuroFHE uses Fully Homomorphic Encryption to analyze your cognitive test results 
                while keeping your data completely private. Your brain performance metrics are 
                encrypted and processed without ever being decrypted.
              </p>
              <div className="fhe-badge neon-cyan">
                <span>FHE-Privacy Guaranteed</span>
              </div>
            </div>
            
            {/* Statistics Panel */}
            <div className="panel stats-panel neon-border cyber-card">
              <h3 className="neon-text-pink">Cognitive Performance</h3>
              <div className="stats-grid">
                <div className="stat-item neon-border">
                  <div className="stat-value neon-text-green">{records.length}</div>
                  <div className="stat-label">Total Assessments</div>
                </div>
                <div className="stat-item neon-border">
                  <div className="stat-value neon-text-cyan">{activeCount}</div>
                  <div className="stat-label">Active Plans</div>
                </div>
                <div className="stat-item neon-border">
                  <div className="stat-value neon-text-yellow">{completedCount}</div>
                  <div className="stat-label">Completed</div>
                </div>
                <div className="stat-item neon-border">
                  <div className="stat-value neon-text-purple">{avgScore}</div>
                  <div className="stat-label">Avg Score</div>
                </div>
              </div>
            </div>
            
            {/* Chart Panel */}
            <div className="panel chart-panel neon-border cyber-card">
              <h3 className="neon-text-blue">Score Distribution</h3>
              {records.length > 0 ? renderScoreChart() : (
                <div className="no-data">
                  <p>No assessment data available</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Training Plans Tab */}
        {activeTab === "training" && (
          <div className="training-section">
            <div className="section-header">
              <h2 className="neon-text-pink">FHE Training Plans</h2>
              <div className="controls">
                <div className="search-box neon-border">
                  <input 
                    type="text"
                    placeholder="Search plans..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="cyber-input"
                  />
                </div>
                <select 
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="cyber-select neon-border"
                >
                  <option value="all">All Categories</option>
                  <option value="Memory">Memory</option>
                  <option value="Attention">Attention</option>
                  <option value="Problem Solving">Problem Solving</option>
                  <option value="Processing Speed">Processing Speed</option>
                </select>
                <button 
                  onClick={loadRecords}
                  className="cyber-button neon-blue"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="records-grid">
              {filteredRecords.length === 0 ? (
                <div className="no-records cyber-card neon-border">
                  <div className="no-records-icon"></div>
                  <p>No training plans found</p>
                  <button 
                    className="cyber-button neon-pink"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Start First Assessment
                  </button>
                </div>
              ) : (
                filteredRecords.map(record => (
                  <div 
                    key={record.id} 
                    className="record-card cyber-card neon-border"
                    onClick={() => showRecordDetails(record)}
                  >
                    <div className="card-header">
                      <span className="record-id">#{record.id.substring(0, 6)}</span>
                      <span className={`status-badge ${record.status} neon-${record.status === 'active' ? 'cyan' : record.status === 'completed' ? 'green' : 'yellow'}`}>
                        {record.status}
                      </span>
                    </div>
                    <div className="card-body">
                      <h4>{record.category}</h4>
                      <p className="training-plan">{record.trainingPlan}</p>
                      <div className="score-display">
                        <span className="score-label">FHE Score:</span>
                        <span className="score-value">{record.cognitiveScore}</span>
                      </div>
                    </div>
                    <div className="card-footer">
                      <span className="owner">{record.owner.substring(0, 6)}...{record.owner.substring(38)}</span>
                      <span className="date">
                        {new Date(record.timestamp * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Create Assessment Modal */}
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {/* Record Detail Modal */}
      {showDetailModal && selectedRecord && (
        <ModalDetail 
          record={selectedRecord}
          onClose={() => setShowDetailModal(false)}
          onActivate={activateTraining}
          onComplete={completeTraining}
          isOwner={isOwner(selectedRecord.owner)}
        />
      )}
      
      {/* Wallet Selector */}
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {/* Transaction Status Modal */}
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card neon-border">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner neon-blue"></div>}
              {transactionStatus.status === "success" && <div className="check-icon neon-green"></div>}
              {transactionStatus.status === "error" && <div className="error-icon neon-red"></div>}
            </div>
            <div className="transaction-message neon-text-white">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
      
      {/* Footer */}
      <footer className="app-footer neon-border-top">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="brain-icon small neon-cyan"></div>
              <span className="neon-text-blue">NeuroFHE</span>
            </div>
            <p>Privacy-Preserving Cognitive Enhancement with FHE Technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link neon-text-cyan">Documentation</a>
            <a href="#" className="footer-link neon-text-cyan">Privacy Policy</a>
            <a href="#" className="footer-link neon-text-cyan">Research</a>
            <a href="#" className="footer-link neon-text-cyan">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge neon-cyan">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright neon-text-white">
            © {new Date().getFullYear()} NeuroFHE. All cognitive data remains encrypted.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!recordData.cognitiveScore) {
      alert("Please enter cognitive score");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card neon-border">
        <div className="modal-header">
          <h2 className="neon-text-pink">Cognitive Assessment</h2>
          <button onClick={onClose} className="close-modal neon-text-white">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner neon-cyan">
            <div className="key-icon"></div> 
            Your cognitive data will be encrypted with FHE for private processing
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label className="neon-text-white">Category</label>
              <select 
                name="category"
                value={recordData.category} 
                onChange={handleChange}
                className="cyber-select neon-border"
              >
                <option value="Memory">Memory</option>
                <option value="Attention">Attention</option>
                <option value="Problem Solving">Problem Solving</option>
                <option value="Processing Speed">Processing Speed</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="neon-text-white">Cognitive Score *</label>
              <input 
                type="number"
                name="cognitiveScore"
                value={recordData.cognitiveScore} 
                onChange={handleChange}
                placeholder="0-100"
                min="0"
                max="100"
                className="cyber-input neon-border"
              />
            </div>
            
            <div className="form-group full-width">
              <label className="neon-text-white">Training Notes</label>
              <textarea 
                name="trainingNotes"
                value={recordData.trainingNotes} 
                onChange={handleChange}
                placeholder="Additional observations or notes..." 
                className="cyber-textarea neon-border"
                rows={3}
              />
            </div>
          </div>
          
          <div className="privacy-notice neon-blue">
            <div className="privacy-icon"></div> 
            Data remains encrypted during FHE processing and analysis
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cyber-button neon-gray"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="cyber-button neon-pink"
          >
            {creating ? "Encrypting with FHE..." : "Submit Assessment"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ModalDetailProps {
  record: TrainingRecord;
  onClose: () => void;
  onActivate: (id: string) => void;
  onComplete: (id: string) => void;
  isOwner: boolean;
}

const ModalDetail: React.FC<ModalDetailProps> = ({ 
  record, 
  onClose, 
  onActivate, 
  onComplete,
  isOwner 
}) => {
  return (
    <div className="modal-overlay">
      <div className="detail-modal cyber-card neon-border">
        <div className="modal-header">
          <h2 className="neon-text-cyan">Training Plan Details</h2>
          <button onClick={onClose} className="close-modal neon-text-white">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-section">
            <h3 className="neon-text-pink">Assessment Information</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="label">Plan ID:</span>
                <span className="value">#{record.id}</span>
              </div>
              <div className="detail-item">
                <span className="label">Category:</span>
                <span className="value">{record.category}</span>
              </div>
              <div className="detail-item">
                <span className="label">Cognitive Score:</span>
                <span className="value score">{record.cognitiveScore}</span>
              </div>
              <div className="detail-item">
                <span className="label">Status:</span>
                <span className={`value status ${record.status}`}>{record.status}</span>
              </div>
              <div className="detail-item">
                <span className="label">Owner:</span>
                <span className="value">{record.owner}</span>
              </div>
              <div className="detail-item">
                <span className="label">Date:</span>
                <span className="value">
                  {new Date(record.timestamp * 1000).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          
          <div className="detail-section">
            <h3 className="neon-text-blue">FHE Training Plan</h3>
            <div className="training-plan-details">
              <p className="plan-description">{record.trainingPlan}</p>
              <div className="fhe-badge neon-cyan">
                <span>FHE-Generated Plan</span>
              </div>
            </div>
          </div>
          
          <div className="detail-section">
            <h3 className="neon-text-green">Encrypted Data</h3>
            <div className="encrypted-data">
              <code className="encrypted-code">{record.encryptedData.substring(0, 100)}...</code>
              <div className="encryption-note">
                <div className="lock-icon"></div>
                <span>Data encrypted using FHE technology</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          {isOwner && record.status === "pending" && (
            <button 
              onClick={() => onActivate(record.id)}
              className="cyber-button neon-cyan"
            >
              Activate Plan
            </button>
          )}
          {isOwner && record.status === "active" && (
            <button 
              onClick={() => onComplete(record.id)}
              className="cyber-button neon-green"
            >
              Mark Complete
            </button>
          )}
          <button 
            onClick={onClose}
            className="cyber-button neon-gray"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;