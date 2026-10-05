import React from 'react'
import "../App.css"
import { Link, useNavigate } from 'react-router-dom'

export default function LandingPage() {
    const router = useNavigate();

    return (
        <div className='landingPageContainer'>
            <nav className='landingNav'>
                <div className='navHeader' onClick={() => router('/')}>
                    <img
                        src="/logo.png"
                        alt="Nexivo"
                        className="navBrandLogo"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <h2>Nexivo</h2>
                </div>
                <div className='navlist'>
                    <button
                        type="button"
                        className="navGuestBtn"
                        onClick={() => router("/aljk23")}
                        title="Join a quick test meeting without registering"
                    >
                        Join as Guest
                    </button>
                    <button
                        type="button"
                        className="navAuthBtn"
                        onClick={() => router("/auth", { state: { tab: 0 } })}
                    >
                        Sign In
                    </button>
                    <button
                        type="button"
                        className="navCtaRegisterBtn"
                        onClick={() => router("/auth", { state: { tab: 1 } })}
                    >
                        Register
                    </button>
                </div>
            </nav>

            <div className="landingMainContainer">
                <div className="landingHeroText">
                    <h1><span className="brandHighlight">Connect</span> with your loved Ones</h1>
                    <p className="landingHeroSubtext">Real-time video calls with live speech translation & multi-language voice dubbing. Communicate across languages without barriers.</p>
                    <div className="landingCtaWrapper">
                        <Link to="/auth" state={{ tab: 1 }} className="landingCtaBtn">Get Started</Link>
                    </div>
                </div>
                <div className="landingHeroVisual">
                    <img src="/mobile.png" alt="Nexivo Mobile Video Call App" />
                </div>
            </div>
        </div>
    )
}