import React from 'react'
import "../App.css"
import { Link, useNavigate } from 'react-router-dom'

export default function LandingPage() {
    const router = useNavigate();

    return (
        <div className='landingPageContainer'>
            <nav className='landingNav'>
                <div className='navHeader' onClick={() => router('/')}>
                    <h2>Nexivo</h2>
                </div>
                <div className='navlist'>
                    <p onClick={() => router("/aljk23")}>Join as Guest</p>
                    <p onClick={() => router("/auth")}>Register</p>
                    <div onClick={() => router("/auth")} role='button'>
                        <p>Login</p>
                    </div>
                </div>
            </nav>

            <div className="landingMainContainer">
                <div className="landingHeroText">
                    <h1><span className="brandHighlight">Connect</span> with your loved Ones</h1>
                    <p className="landingHeroSubtext">Real-time video calls with live speech translation & multi-language voice dubbing. Communicate across languages without barriers.</p>
                    <div className="landingCtaWrapper" role='button'>
                        <Link to={"/auth"} className="landingCtaBtn">Get Started</Link>
                    </div>
                </div>
                <div className="landingHeroVisual">
                    <img src="/mobile.png" alt="Nexivo Mobile Video Call App" />
                </div>
            </div>
        </div>
    )
}