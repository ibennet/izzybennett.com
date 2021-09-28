import React from 'react';
import './App.css';
import {
  HashRouter as Router,
  Switch,
  Route,
  Link,
  NavLink
} from "react-router-dom";
import $ from 'jquery';
import ReactMarkdown from 'react-markdown';

export default class App extends React.Component {

  render() {
    return (
      <Router>
        <div className="app">
          <Nav />

          <main role="main" className="flex-shrink-0 container">
            <Switch>
              <Route exact path="/recipes">
                <Recipes />
              </Route>
              <Route exact path="/projects">
                <Projects />
              </Route>
              <Route exact path="/">
                <Home />
              </Route>
              <Route path="/apple_bread">
                <Recipe file="apple_bread.md" />
              </Route>
              <Route path="/apple_pie">
                <Recipe file="apple_pie.md" />
              </Route>
              <Route path="/blueberry_muffins">
                <Recipe file="blueberry_muffins.md" />
              </Route>
              <Route path="/chocochip_cookies">
                <Recipe file="chocochip_cookies.md" />
              </Route>
              <Route path="/gingersnaps">
                <Recipe file="gingersnaps.md" />
              </Route>
              <Route path="/honey_fried_chicken">
                <Recipe file="honey_fried_chicken.md" />
              </Route>
              <Route path="/lemon_blueberry_coffee_cake">
                <Recipe file="lemon_blueberry_coffee_cake.md" />
              </Route>
              <Route path="/pizza_dough">
                <Recipe file="pizza_dough.md" />
              </Route>
              <Route path="/potato_leek_soup">
                <Recipe file="potato_leek_soup.md" />
              </Route>
              <Route path="/pumpkin_bread">
                <Recipe file="pumpkin_bread.md" />
              </Route>
              <Route path="/raspberry_lemon_scones">
                <Recipe file="raspberry_lemon_scones.md" />
              </Route>
              <Route path="/sweet_spicy_sauce">
                <Recipe file="sweet_spicy_sauce.md" />
              </Route>
              <Route path="/sushi_rice">
                <Recipe file="sushi_rice.md" />
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
        <img src="me.jpg" alt="Izzy" className="img-fluid img-thumbnail float-right" width="20%" />
        <h1 className="mt-5">Izzy Bennett</h1>
        <p className="lead">Welcome to my personal website!</p>
        <p>
          This website is a personal project of mine created with React.js<br />
          I mostly use this website to store my recipes and share them with others.<br />
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
        <Project title="Groceries" image="groceries_icon.jpeg" url="https://github.com/ibennet/groceries-android" description="Android application that allows users to create and collaborate grocery lists with live updates. Currently private."
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
        <Router>
          <div>
            <nav>
              <ul className="list-group list-group-flush">
              <li className="list-group-item"><Link to="/apple_bread">Apple Bread</Link></li>
                <li className="list-group-item"><Link to="/apple_pie">Apple Pie</Link></li>
                <li className="list-group-item"><Link to="/blueberry_muffins">Blueberry Muffins</Link></li>
                <li className="list-group-item"><Link to="/chocochip_cookies">Chocolate Chip Cookies</Link></li>
                <li className="list-group-item"><Link to="/gingersnaps">Gingersnaps</Link></li>
                <li className="list-group-item"><Link to="/honey_fried_chicken">Honey Fried Chicken</Link></li>
                <li className="list-group-item"><Link to="/lemon_blueberry_coffee_cake">Lemon Blueberry Coffee Cake</Link></li>
                <li className="list-group-item"><Link to="/pizza_dough">Pizza Dough</Link></li>
                <li className="list-group-item"><Link to="/potato_leek_soup">Potato Leek Soup</Link></li>
                <li className="list-group-item"><Link to="/pumpkin_bread">Pumpkin Bread</Link></li>
                <li className="list-group-item"><Link to="/raspberry_lemon_scones">Raspberry Lemon Scones</Link></li>
                <li className="list-group-item"><Link to="/sweet_spicy_sauce">Sweet and Spicy Sauce</Link></li>
                <li className="list-group-item"><Link to="/sushi_rice">Sushi Rice</Link></li>
              </ul>
            </nav>
          </div>
        </Router>
      </div>
    )
  }
}

class Recipe extends React.Component {
  constructor(props) {
    super(props);
    this.state = { recipe: null}
  }

  componentWillMount() {
    fetch(this.props.file).then((response) => response.text()).then((text) => {
      this.setState({ recipe: text })
    })
  }

  render() {
    return (
      <div className="Recipe">
        <ReactMarkdown source={this.state.recipe} />
      </div>
    )
  }
}

class Project extends React.Component {
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
  render() {
    return (
      <nav className="navbar navbar-expand-md navbar-light fixed-top">
        <Link to="/" className="navbar-brand">Izzy Bennett</Link>
        <button className="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarCollapse" aria-controls="navbarCollapse" aria-expanded="false" aria-label="Toggle navigation">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarCollapse">
          <ul className="navbar-nav mr-auto">
            <li className="nav-item">
              <NavLink to="/recipes" className="nav-link" onClick={() => { $("#navbarCollapse").collapse("hide") }}>Recipes</NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/projects" className="nav-link" onClick={() => { $("#navbarCollapse").collapse("hide") }}>Projects</NavLink>
            </li>
            <li className="nav-item">
              <a className="nav-link" href="/resume.pdf">Resume</a>
            </li>
          </ul>
        </div>
      </nav>
    )
  }
}


class Footer extends React.Component {
  render() {
    return (
      <footer className="footer mt-auto py-3">
        <div className="container">
          <center>
            <span className="text-muted">&copy; Izzy Bennett 2021</span>
          </center>
        </div>
      </footer>
    );
  }
}