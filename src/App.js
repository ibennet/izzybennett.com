import React from 'react';
import './App.css';
import {
  HashRouter as Router,
  Switch,
  Route,
  Link
} from "react-router-dom";
import $ from 'jquery';

export default class App extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return (
      <Router>
        <div className="app">
          <Nav />

          <main role="main" className="flex-shrink-0 container">
            <Switch>
              <Route exact path="/projects">
                <Projects />
              </Route>
              <Route exact path="/recipes">
                <Recipes />
              </Route>
              <Route exact path="/">
                <Home />
              </Route>
            </Switch>
          </main>
          <Footer />
        </div>
      </Router>
    );
  }
}

class Home extends React.Component {
  render() {
    return (
      <div className="Home">
        <img src="me.jpeg" className="img-fluid img-thumbnail float-right" width="20%" />
        <h1 className="mt-5">Izzy Bennett</h1>
        <p className="lead">Welcome to my personal website!</p>
        <p>
          I am a recent graduate from George Mason University where I earned my BS in Computer Science.<br />
          This website is a personal project of mine created with React.js<br />
          Here I have a list of my recent projects, my resume, and some recipes I've collected.<br />
          I can be reached at <b>me@izzybennett.com</b>
        </p>

      </div>
    )
  }
}

class Projects extends React.Component {
  render() {
    return (
      <div className="Home">
        <h1 className="mt-5">Projects</h1>
        <p className="lead">Recent projects of mine</p>
        <Project title="Groceries" image="groceries_icon.jpeg" url="" description="Android application that allows users to create and colloborate grocery lists with live updates."
          tag="Created by Izzy Bennett and Tiernan O'Rourke" />
      </div>
    )
  }
}

class Recipes extends React.Component {
  render() {
    return (
      <div className="Recipes">
        <h1 className="mt-5">Recipes</h1>
        <p className="lead">An archive</p>
        <ul className="list-group list-group-flush">
        <li className="list-group-item"><a href="chicken_lo_mein.pdf" target="_blank">Chicken Lo Mein</a></li>
          <li className="list-group-item"><a href="chicken_ramen.pdf" target="_blank">Chicken Ramen </a></li>
          <li className="list-group-item"><a href="pumpkin_bread.pdf" target="_blank">Pumpkin Bread</a></li>
          <li className="list-group-item"><a href="chicken_lo_mein.pdf" target="_blank">Chocolate Chip Cookies</a></li>
          <li className="list-group-item"><a href="vegan_gingersnaps.pdf" target="_blank">Gingersnaps</a></li>
          <li className="list-group-item"><a href="honey_fried_chicken.pdf" target="_blank">Honey Fried Chicken</a></li>
          <li className="list-group-item"><a href="chicken_lo_mein.pdf" target="_blank">Izzy Burrito</a></li>
          <li className="list-group-item"><a href="izzys_fajitas.pdf" target="_blank">Izzy's Fajitas</a></li>
          <li className="list-group-item"><a href="potato_leek_soup.pdf" target="_blank">Potato Leek Soup</a></li>
          <li className="list-group-item"><a href="chicken_lo_mein.pdf" target="_blank">Thai Curry Soup</a></li>
          
        </ul>
      </div>
    )
  }
}

class Project extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      <div className="card">
        <img src="" className="card-img-top" />
        <div className="card-body">
          <h5 className="card-title"><a href={this.props.url}>{this.props.title}</a></h5>
          <p className="card-text">{this.props.description}</p>
          <p className="card-text"><small className="text-muted">{this.props.tag}</small></p>
        </div>
      </div>
    )
  }
}


class Nav extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      <nav className="navbar navbar-expand-md navbar-dark fixed-top bg-dark">
        <Link to="/" className="navbar-brand">Izzy Bennett</Link>
        <button className="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarCollapse" aria-controls="navbarCollapse" aria-expanded="false" aria-label="Toggle navigation">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarCollapse">
          <ul className="navbar-nav mr-auto">
            <li className="nav-item">
              <Link to="/projects" className="nav-link" onClick={() => {$("#navbarCollapse").collapse("hide")}}>Projects</Link>
            </li>
            <li className="nav-item">
              <a className="nav-link" href="/resume.pdf">Resume</a>
            </li>
            <li className="nav-item">
              <Link to="/recipes" className="nav-link" onClick={() => {$("#navbarCollapse").collapse("hide")}}>Recipes</Link>
            </li>
          </ul>
        </div>
      </nav>
    )
  }
}


class Footer extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      <footer className="footer mt-auto py-3">
        <div className="container">
          <center>
            <span className="text-muted">&copy; Izzy Bennett 2020</span>
          </center>
        </div>
      </footer>
    );
  }
}